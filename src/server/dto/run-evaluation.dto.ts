import { EvaluationCase, EvaluationThresholds } from "../../core/domain/evaluation";

export class RunEvaluationDto {
  cases!: EvaluationCase[];
  thresholds?: EvaluationThresholds;
}
