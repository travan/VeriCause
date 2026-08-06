import {
  GuardReportInput,
  GuardrailDecision,
  GuardrailPolicyOverrides,
  ProposedAction,
  RiskLevel,
} from "../domain/guardrail";
import { CoreVerdict } from "../domain/verification";
import { GuardrailDecisionRepository } from "../guardrail/decision-store";
import { GuardrailPolicyEngine } from "../guardrail/policy-engine";
import { ReportRepository } from "../ports";

export class GuardrailService {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly decisionRepository: GuardrailDecisionRepository,
    private readonly policyEngine = new GuardrailPolicyEngine(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async decide(input: GuardReportInput): Promise<GuardrailDecision> {
    const report = await this.reportRepository.getById(input.reportId);
    if (!report.coreVerdict) {
      throw new Error(`Report '${input.reportId}' does not contain a core verdict.`);
    }
    return this.decideVerdict(
      report.coreVerdict,
      input.risk,
      input.proposedAction,
      input.policy,
      input.reportId,
    );
  }

  async decideVerdict(
    verdict: CoreVerdict,
    risk: RiskLevel,
    proposedAction?: ProposedAction,
    policy?: GuardrailPolicyOverrides,
    reportId?: string,
  ): Promise<GuardrailDecision> {
    const evaluation = this.policyEngine.evaluate(verdict, risk, policy);
    const createdAt = this.now();
    const decision: GuardrailDecision = {
      decisionId: `decision-${createdAt.getTime()}`,
      reportId,
      action: evaluation.action,
      risk,
      policyId: evaluation.policy.id,
      verdictStatus: verdict.status,
      proposedAction,
      reasons: evaluation.reasons,
      evidenceRefs: verdict.evidenceRefs,
      createdAt: createdAt.toISOString(),
    };
    return this.decisionRepository.save(decision);
  }

  getById(decisionId: string): Promise<GuardrailDecision> {
    return this.decisionRepository.getById(decisionId);
  }
}
