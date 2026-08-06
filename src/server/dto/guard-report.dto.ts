import { GuardReportInput } from "../../core/domain/guardrail";

export class GuardReportDto implements GuardReportInput {
  reportId!: string;
  risk!: GuardReportInput["risk"];
  proposedAction?: GuardReportInput["proposedAction"];
  policy?: GuardReportInput["policy"];
}
