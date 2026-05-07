import type { OreType, BlueprintId, IndustrialJob, JobType } from './EconomyTypes.ts';
import { REFINE_RECIPES, MANUFACTURE_BLUEPRINTS, ITEM_DEFS } from './EconomyTypes.ts';
import { useEconomyStore } from './InventoryStore.ts';
import { globalBus } from '../../core/network/MessageBus.ts';

// ── Job queue ─────────────────────────────────────────────────────────────────

let _jobSeq = 0;
function jobId(): string { return `job_${Date.now()}_${++_jobSeq}`; }

// ── RefinerySystem ────────────────────────────────────────────────────────────
// Manages the industrial queue: refining and manufacturing.
// Runs in the client render loop; processes completions.

export const RefinerySystem = {
  name: 'RefinerySystem',

  /** Call each render frame to check for job completions. */
  update(dt: number): void {
    const store  = useEconomyStore.getState();
    const nowMs  = Date.now();

    for (const job of store.jobs) {
      if (job.completed) continue;
      if (nowMs >= job.startedAt + job.durationMs) {
        this._completeJob(job.id);
      }
    }
    void dt;
  },

  _completeJob(jobId: string): void {
    const store = useEconomyStore.getState();
    const job   = store.jobs.find(j => j.id === jobId);
    if (!job || job.completed) return;

    // Transfer outputs to cargo
    let delivered = false;
    for (const [item, qty] of Object.entries(job.output) as Array<[string, number]>) {
      const added = store.addCargo(item as never, qty);
      if (added) delivered = true;
    }

    store.completeJob(jobId);
    globalBus.emit('industry:job_complete', { jobId, delivered, output: job.output });
  },

  // ── Refining ─────────────────────────────────────────────────────────────

  /**
   * Start a refining job.
   * stationId: station where refining takes place.
   * oreType: which ore to refine.
   * qty: number of ore units (must be a multiple of recipe.inputQty).
   * Returns job ID or null if failed (insufficient cargo / no recipe).
   */
  startRefine(stationId: string, oreType: OreType, qty: number): string | null {
    const recipe = REFINE_RECIPES[oreType];
    if (!recipe) return null;

    // Quantise to batch size
    const batches = Math.floor(qty / recipe.inputQty);
    if (batches <= 0) return null;

    const actualInput  = batches * recipe.inputQty;
    const rawOutput    = batches * recipe.outputQty;
    const actualOutput = Math.floor(rawOutput * recipe.efficiency);

    const store = useEconomyStore.getState();
    if (!store.removeCargo(oreType, actualInput)) return null;

    const durationMs = batches * recipe.timeSeconds * 1000;
    const job: IndustrialJob = {
      id:           jobId(),
      type:         'refine' as JobType,
      stationId,
      input:        { [oreType]: actualInput },
      output:       { [recipe.outputMat]: actualOutput },
      startedAt:    Date.now(),
      durationMs,
      completed:    false,
    };
    store.addJob(job);
    globalBus.emit('industry:job_started', { jobId: job.id, type: 'refine', input: job.input, output: job.output, durationMs });
    return job.id;
  },

  // ── Manufacturing ─────────────────────────────────────────────────────────

  /**
   * Start a manufacturing run from a blueprint instance.
   * blueprintInstId: the instId of the BlueprintInstance in the player's inventory.
   * runs: number of manufacturing runs (capped by runs remaining on BPC).
   */
  startManufacture(stationId: string, blueprintInstId: string, runs: number): string | null {
    const store = useEconomyStore.getState();
    const inst  = store.blueprints.find(b => b.instId === blueprintInstId);
    if (!inst) return null;

    const def = MANUFACTURE_BLUEPRINTS[inst.type as BlueprintId];
    if (!def) return null;

    // Cap runs to remaining (BPC) or unlimited (BPO)
    const maxRuns  = inst.runsLeft === -1 ? runs : Math.min(runs, inst.runsLeft);
    if (maxRuns <= 0) return null;

    // Check and consume materials
    const input: Partial<Record<string, number>> = {};
    for (const [mat, baseQty] of Object.entries(def.inputs) as Array<[string, number]>) {
      const actual = Math.ceil(baseQty * maxRuns * (1 - inst.matEff * 0.15));
      if (!store.removeCargo(mat as never, actual)) {
        // Rollback: re-add already consumed mats
        for (const [rm, rq] of Object.entries(input)) store.addCargo(rm as never, rq as number);
        return null;
      }
      input[mat] = actual;
    }

    // Output calculation
    const output: Partial<Record<string, number>> = {
      [def.outputItem]: def.outputQty * maxRuns,
    };

    const timeEff    = 1 - inst.timeEff * 0.2;
    const durationMs = Math.round(def.timePerRun * maxRuns * timeEff * 1000);

    const job: IndustrialJob = {
      id:             jobId(),
      type:           'manufacture' as JobType,
      stationId,
      input,
      output,
      startedAt:      Date.now(),
      durationMs,
      completed:      false,
      blueprintInstId,
    };
    store.addJob(job);

    // Decrement BPC runs
    if (inst.runsLeft !== -1) {
      for (let i = 0; i < maxRuns; i++) store.decrementBlueprintRun(blueprintInstId);
    }

    globalBus.emit('industry:job_started', { jobId: job.id, type: 'manufacture', input: job.input, output: job.output, durationMs });
    return job.id;
  },

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Format a duration in seconds into HH:MM:SS. */
  formatDuration(ms: number): string {
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sc}s`;
    return `${sc}s`;
  },

  /** Check if player has materials for a blueprint run. */
  canManufacture(blueprintInstId: string, runs = 1): { ok: boolean; missing: string[] } {
    const store   = useEconomyStore.getState();
    const inst    = store.blueprints.find(b => b.instId === blueprintInstId);
    if (!inst) return { ok: false, missing: ['Blueprint not found'] };
    const def     = MANUFACTURE_BLUEPRINTS[inst.type as BlueprintId];
    if (!def)     return { ok: false, missing: ['Unknown blueprint'] };

    const missing: string[] = [];
    for (const [mat, baseQty] of Object.entries(def.inputs) as Array<[string, number]>) {
      const needed  = Math.ceil(baseQty * runs * (1 - inst.matEff * 0.15));
      const have    = store.cargo[mat as never] ?? 0;
      if ((have as number) < needed) {
        const name = (ITEM_DEFS as Record<string, { name: string } | undefined>)[mat]?.name ?? mat;
        missing.push(`${name}: need ${needed}, have ${have as number}`);
      }
    }
    return { ok: missing.length === 0, missing };
  },
};
