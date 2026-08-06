import {
  CoreVerdict,
  EvidenceBundle,
  VerificationClaim,
} from "./verification";

export type RuntimeTarget = "api" | "shell" | "database" | "tool";
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RuntimeVerificationInput = {
  target: RuntimeTarget;
  claim: VerificationClaim;
  evidence: EvidenceBundle;
};

export type RuntimeVerificationResult = {
  verificationId: string;
  target: RuntimeTarget;
  claim: VerificationClaim;
  evidence: EvidenceBundle;
  coreVerdict: CoreVerdict;
  createdAt: string;
};
