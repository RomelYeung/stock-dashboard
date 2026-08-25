import React, { useCallback, memo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import GurusTab from "../components/GurusTab";
import ErrorBoundary from "../components/ErrorBoundary";
import { useAuth } from "../context/AuthContext";
import { usePortfolioItems } from "../hooks/useStockData";

function GurusPage({ setSelectedTicker }) {
  const { guruId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    tickers,
    wishlistTickers,
    addToWishlist,
    removeFromWishlist,
    portfolio,
  } = usePortfolioItems(user?.id);

  // Gracefully handle a missing guruId: render the full guru grid.
  // When guruId is present, GurusTab opens the GuruDetail view for it.
  const selectedGuruId = guruId || null;

  const handleSetSelectedGuruId = useCallback((id) => {
    if (id) {
      navigate(`/gurus/${id}`);
    } else {
      navigate("/gurus");
    }
  }, [navigate]);

  return (
    <ErrorBoundary>
      <GurusTab
        user={user}
        tickers={tickers}
        wishlistTickers={wishlistTickers}
        addToWishlist={addToWishlist}
        removeFromWishlist={removeFromWishlist}
        selectedGuruId={selectedGuruId}
        setSelectedGuruId={handleSetSelectedGuruId}
        setSelectedTicker={setSelectedTicker}
        portfolio={portfolio}
      />
    </ErrorBoundary>
  );
}

export default memo(GurusPage);

