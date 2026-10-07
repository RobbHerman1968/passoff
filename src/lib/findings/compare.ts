export type ComparisonInput = {
  baselineValue: number | null;
  comparisonValue: number | null;
  baselineSample: number;
  comparisonSample: number;
  minSample: number;
  compatible: boolean;
};

export type ComparisonResult = {
  outcome:
    | "appears_improved"
    | "appears_unchanged"
    | "appears_worse"
    | "not_enough_data"
    | "incompatible";
  absoluteChange: number | null;
  percentagePointChange: number | null;
  summary: string;
};

export function compareRates(input: ComparisonInput): ComparisonResult {
  if (!input.compatible) {
    return {
      outcome: "incompatible",
      absoluteChange: null,
      percentagePointChange: null,
      summary:
        "These periods cannot be compared because the route, layout, viewport, or metric does not match.",
    };
  }
  if (
    input.baselineSample < input.minSample ||
    input.comparisonSample < input.minSample ||
    input.baselineValue == null ||
    input.comparisonValue == null
  ) {
    return {
      outcome: "not_enough_data",
      absoluteChange: null,
      percentagePointChange: null,
      summary:
        "Not enough eligible sessions met the minimum sample, so Passoff is not drawing a comparison.",
    };
  }

  const absoluteChange = input.comparisonValue - input.baselineValue;
  const percentagePointChange = absoluteChange * 100;
  const improved = absoluteChange < -0.01;
  const worse = absoluteChange > 0.01;
  const outcome = improved
    ? "appears_improved"
    : worse
      ? "appears_worse"
      : "appears_unchanged";

  return {
    outcome,
    absoluteChange,
    percentagePointChange,
    summary: `The metric moved from ${(input.baselineValue * 100).toFixed(1)}% to ${(input.comparisonValue * 100).toFixed(1)}%. Both periods met the minimum sample. This suggests ${
      outcome === "appears_improved"
        ? "improvement"
        : outcome === "appears_worse"
          ? "a possible regression"
          : "little change"
    } but does not verify the issue by itself.`,
  };
}
