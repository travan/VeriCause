import { join } from "node:path";

import { GuardrailDecision } from "../domain/guardrail";
import { readJsonFile, writeJsonFile } from "../fs";
import { SAFE_ID_RE } from "../schemas";

export interface GuardrailDecisionRepository {
  save(decision: GuardrailDecision): Promise<GuardrailDecision>;
  getById(decisionId: string): Promise<GuardrailDecision>;
}

export class FileGuardrailDecisionStore implements GuardrailDecisionRepository {
  constructor(private readonly artifactsDir: string) {}

  async save(decision: GuardrailDecision): Promise<GuardrailDecision> {
    await writeJsonFile(this.pathFor(decision.decisionId), decision);
    return decision;
  }

  async getById(decisionId: string): Promise<GuardrailDecision> {
    return readJsonFile<GuardrailDecision>(this.pathFor(decisionId));
  }

  private pathFor(decisionId: string): string {
    if (!SAFE_ID_RE.test(decisionId)) {
      throw new Error(`Invalid guardrail decision ID: '${decisionId}'`);
    }
    return join(this.artifactsDir, "guardrail-decisions", `${decisionId}.json`);
  }
}
