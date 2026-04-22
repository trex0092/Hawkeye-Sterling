// Hawkeye Sterling — customer-lifecycle state machine.
// Named states, transitions, entry/exit guards. Every transition requires a
// guard pass; failure surfaces the unmet requirement to the operator.

export type LifecycleState =
  | 'prospect'
  | 'edd_pending'
  | 'onboarded'
  | 'active_monitoring'
  | 'heightened_monitoring'
  | 'frozen'
  | 'exit_pending'
  | 'exited';

export type LifecycleEvent =
  | 'submit_prospect'
  | 'pass_cdd'
  | 'require_edd'
  | 'pass_edd'
  | 'onboard'
  | 'escalate'
  | 'de_escalate'
  | 'confirmed_sanctions_match'
  | 'initiate_exit'
  | 'complete_exit';

export interface TransitionGuard {
  (ctx: LifecycleContext): { ok: boolean; missing: string[] };
}

export interface LifecycleContext {
  cddComplete: boolean;
  eddComplete: boolean;
  ubosIdentified: boolean;
  screeningCurrent: boolean;
  mlroApproved: boolean;
  seniorMgmtApproved: boolean;
  fourEyesSatisfied: boolean;
  redlineFired?: string;
}

export interface Transition {
  from: LifecycleState;
  event: LifecycleEvent;
  to: LifecycleState;
  guard: TransitionGuard;
}

const allTrue = (xs: Array<[string, boolean]>) => {
  const missing = xs.filter(([, v]) => !v).map(([k]) => k);
  return { ok: missing.length === 0, missing };
};

export const TRANSITIONS: Transition[] = [
  { from: 'prospect', event: 'submit_prospect', to: 'edd_pending', guard: () => ({ ok: true, missing: [] }) },
  { from: 'edd_pending', event: 'pass_cdd', to: 'onboarded',
    guard: (c) => allTrue([
      ['cdd_complete', c.cddComplete],
      ['ubos_identified', c.ubosIdentified],
      ['screening_current', c.screeningCurrent],
      ['mlro_approved', c.mlroApproved],
      ['four_eyes_satisfied', c.fourEyesSatisfied],
    ]),
  },
  { from: 'edd_pending', event: 'require_edd', to: 'edd_pending', guard: () => ({ ok: true, missing: [] }) },
  { from: 'edd_pending', event: 'pass_edd', to: 'onboarded',
    guard: (c) => allTrue([
      ['cdd_complete', c.cddComplete],
      ['edd_complete', c.eddComplete],
      ['ubos_identified', c.ubosIdentified],
      ['screening_current', c.screeningCurrent],
      ['mlro_approved', c.mlroApproved],
      ['senior_mgmt_approved', c.seniorMgmtApproved],
      ['four_eyes_satisfied', c.fourEyesSatisfied],
    ]),
  },
  { from: 'onboarded', event: 'onboard', to: 'active_monitoring', guard: () => ({ ok: true, missing: [] }) },
  { from: 'active_monitoring', event: 'escalate', to: 'heightened_monitoring', guard: () => ({ ok: true, missing: [] }) },
  { from: 'heightened_monitoring', event: 'de_escalate', to: 'active_monitoring',
    guard: (c) => allTrue([['mlro_approved', c.mlroApproved], ['four_eyes_satisfied', c.fourEyesSatisfied]]),
  },
  { from: 'active_monitoring', event: 'confirmed_sanctions_match', to: 'frozen', guard: () => ({ ok: true, missing: [] }) },
  { from: 'heightened_monitoring', event: 'confirmed_sanctions_match', to: 'frozen', guard: () => ({ ok: true, missing: [] }) },
  { from: 'frozen', event: 'initiate_exit', to: 'exit_pending',
    guard: (c) => allTrue([['mlro_approved', c.mlroApproved], ['senior_mgmt_approved', c.seniorMgmtApproved]]),
  },
  { from: 'active_monitoring', event: 'initiate_exit', to: 'exit_pending',
    guard: (c) => allTrue([['mlro_approved', c.mlroApproved], ['senior_mgmt_approved', c.seniorMgmtApproved], ['four_eyes_satisfied', c.fourEyesSatisfied]]),
  },
  { from: 'heightened_monitoring', event: 'initiate_exit', to: 'exit_pending',
    guard: (c) => allTrue([['mlro_approved', c.mlroApproved], ['senior_mgmt_approved', c.seniorMgmtApproved], ['four_eyes_satisfied', c.fourEyesSatisfied]]),
  },
  { from: 'exit_pending', event: 'complete_exit', to: 'exited',
    guard: (c) => allTrue([['mlro_approved', c.mlroApproved], ['four_eyes_satisfied', c.fourEyesSatisfied]]),
  },
];

export interface TransitionResult {
  ok: boolean;
  from: LifecycleState;
  to?: LifecycleState;
  missing: string[];
}

export function transition(
  from: LifecycleState,
  event: LifecycleEvent,
  ctx: LifecycleContext,
): TransitionResult {
  if (ctx.redlineFired) {
    return { ok: false, from, missing: [`redline:${ctx.redlineFired}`] };
  }
  const t = TRANSITIONS.find((x) => x.from === from && x.event === event);
  if (!t) return { ok: false, from, missing: [`no-transition:${from}->${event}`] };
  const g = t.guard(ctx);
  if (!g.ok) return { ok: false, from, missing: g.missing };
  return { ok: true, from, to: t.to, missing: [] };
}
