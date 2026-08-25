import MarketIndicatorsPage from "../components/MarketIndicatorsPage";
import ErrorBoundary from "../components/ErrorBoundary";

export default function IndicatorsPage() {
  return (
    <ErrorBoundary>
      <MarketIndicatorsPage />
    </ErrorBoundary>
  );
}
