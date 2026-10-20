import { RuntimeVerificationService } from "../core/application/runtime-verification-service";
import { GuardrailPolicyEngine } from "../core/guardrail/policy-engine";

export function runDemo(json: boolean): void {
  const verifier = new RuntimeVerificationService();
  const policy = new GuardrailPolicyEngine();
  const cases = [
    { label: "API returned 200", observed: 200 },
    { label: "API returned 500", observed: 500 },
    { label: "No response evidence", observed: undefined },
  ];

  const results = cases.map(({ label, observed }, index) => {
    const result = verifier.verify({
      target: "api",
      claim: {
        id: `demo-api-${index + 1}`,
        subject: "api",
        predicate: "status_code",
        operator: "equals",
        expected: 200,
        confidence: 0.98,
        rationale: "The AI claims the API request succeeded with HTTP 200.",
        source: "ai",
      },
      evidence: {
        items: observed === undefined ? [] : [{
          id: `demo-response-${index + 1}`,
          type: "api.status_code",
          value: observed,
          source: "synthetic-demo",
          observedAt: new Date().toISOString(),
        }],
      },
    });
    return {
      label,
      ...result,
      decision: policy.evaluate(result.coreVerdict, "high"),
    };
  });

  if (json) {
    console.log(JSON.stringify({ demo: true, risk: "high", results }, null, 2));
    return;
  }

  console.log([
    "AI Reliability Runtime — evidence verification demo",
    "",
    'Claim: "The API returned HTTP 200." AI confidence: 98%.',
    "Synthetic evidence, real verifier and default policy. Risk: high.",
    "",
    ...results.map(({ label, coreVerdict, decision }) =>
      `${label.padEnd(24)} ${coreVerdict.status.padEnd(14)} -> ${decision.action}`,
    ),
    "",
    "Confidence alone does not determine the decision; evidence does.",
    "Your application must enforce the returned policy action.",
    "No API calls, browser launch, or files written by this demo.",
    "",
    "Inspect the evidence: npx ai-reliability-runtime demo --json",
    "Verify your own data: npx ai-reliability-runtime verify --input ./claim.json",
    "Docs: https://github.com/travan/VeriCause#readme",
  ].join("\n"));
}
