import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DCFAnalysis from "../DCFAnalysis";

describe("DCFAnalysis", () => {
  it("uses backend sensitivity values and omits synthetic models", () => {
    const markup = renderToStaticMarkup(
      <DCFAnalysis
        currentPrice={100}
        loading={false}
        dcfData={{
          params: { wacc: 0.1, projectionGrowth: 0.05, projectionMethod: "scalar-fcff" },
          dcf: { fairValue: 999 },
          monteCarlo: null,
          sensitivity: {
            projectionYears: 5,
            waccAdjustments: [0],
            growthAdjustments: [0],
            values: [[123.45]],
          },
        }}
      />
    );

    expect(markup).toMatch(/Adjusted Fair Value \(DCF\)<\/span><span[^>]*>\$123\.45<\/span>/);
    expect(markup).not.toContain("$999.00");
    expect(markup).not.toContain("DDM (Gordon Growth)");
    expect(markup).not.toContain("Residual Income (RIM)");
    expect(markup).toContain("FCF Growth");
    expect(markup).not.toContain("Growth Drivers");
    expect(markup).not.toContain("Revenue Growth");
  });

  it("shows driver assumptions and revenue-growth sensitivity terminology", () => {
    const markup = renderToStaticMarkup(
      <DCFAnalysis
        currentPrice={100}
        loading={false}
        dcfData={{
          params: {
            wacc: 0.1,
            projectionGrowth: 0.18,
            projectionMethod: "driver-fcff",
            diagnostics: ["driver-sales-to-capital-fallback:latest-capital"],
            drivers: {
              assumptions: {
                explicitYears: 10,
                initialGrowth: 0.18,
                terminalGrowth: 0.025,
                startingMargin: -0.02,
                targetMargin: 0.15,
                normalizedTaxRate: 0.21,
                salesToCapitalRatio: 2,
              },
              sources: {
                growth: "historical revenue",
                margin: "annual operating income",
                reinvestment: "latest invested capital fallback",
              },
              annualSchedule: [],
            },
          },
          dcf: { fairValue: 123.45 },
          monteCarlo: null,
          sensitivity: {
            projectionYears: 10,
            waccAdjustments: [0],
            growthAdjustments: [0],
            values: [[123.45]],
          },
        }}
      />
    );

    expect(markup).toContain("Growth Drivers");
    expect(markup).toContain("Revenue Growth");
    expect(markup).toContain("18.0% → 2.5%");
    expect(markup).toContain("-2.0% → 15.0%");
    expect(markup).toContain("2.0x");
    expect(markup).toContain("10-year explicit forecast");
    expect(markup).toContain("Sources: historical revenue");
    expect(markup).not.toContain("FCF Growth");

    const missingDriversMarkup = renderToStaticMarkup(
      <DCFAnalysis
        currentPrice={100}
        loading={false}
        dcfData={{
          params: { wacc: 0.1, projectionGrowth: 0.18, projectionMethod: "driver-fcff" },
          dcf: { fairValue: 123.45 },
          sensitivity: {
            projectionYears: 10,
            waccAdjustments: [0],
            growthAdjustments: [0],
            values: [[123.45]],
          },
        }}
      />
    );
    expect(missingDriversMarkup).toContain("— → —");
  });

  it("shows valued residual income without FCFF controls", () => {
    const markup = renderToStaticMarkup(
      <DCFAnalysis
        currentPrice={100}
        loading={false}
        dcfData={{
          params: { modelType: "financial-residual-income", financialSubtype: "bank", status: "valued" },
          dcf: null,
          monteCarlo: null,
          sensitivity: null,
          rim: {
            eligible: true,
            status: "valued",
            financialSubtype: "bank",
            fairValue: 125,
            startingRoe: 0.15,
            terminalRoe: 0.12,
            payout: 0.4,
            costOfEquity: { value: 0.1 },
            capital: { ratio: 0.146, threshold: { value: 0.115 } },
            scenarios: { bear: { fairValue: 90 }, base: { fairValue: 125 }, bull: { fairValue: 150 } },
            projectedYears: [{ year: 1, roe: 0.144, residualIncome: 5000000000, endingBook: 250000000000 }],
          },
        }}
      />
    );

    expect(markup).toContain("Residual Income Review");
    expect(markup).toContain("CET1 capital gate passed");
    expect(markup).toContain("$125.00");
    expect(markup).toContain("25.0% vs market");
    expect(markup).toContain("Scenario fair values");
    expect(markup).toContain("1-year explicit forecast");
    expect(markup).not.toContain("Interactive Models");
    expect(markup).not.toContain("WACC:");
    expect(markup).not.toContain("Monte Carlo");
  });

  it("explains an unvalued residual-income result without FCFF controls", () => {
    const markup = renderToStaticMarkup(
      <DCFAnalysis
        currentPrice={70}
        loading={false}
        dcfData={{
          params: { modelType: "financial-residual-income", financialSubtype: "insurer", status: "unvalued" },
          dcf: null,
          rim: {
            eligible: false,
            status: "unvalued",
            financialSubtype: "insurer",
            reasonCodes: ["rim-insurer-solvency-unavailable"],
          },
        }}
      />
    );

    expect(markup).toContain("Not valued");
    expect(markup).toContain("rim-insurer-solvency-unavailable");
    expect(markup).toContain("Required statutory surplus or risk-based capital evidence is unavailable.");
    expect(markup).not.toContain("Valuation analysis unavailable for this stock.");
    expect(markup).not.toContain("Interactive Models");
    expect(markup).not.toContain("WACC:");
  });
});
