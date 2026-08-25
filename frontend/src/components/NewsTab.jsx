import { useState, useCallback } from 'react';
import { useStockNews, useStockNewsSummary } from '../hooks/useStockData';

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupByTime(articles) {
  const groups = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  const todayArticles = articles.filter(a => new Date(a.publishedAt) >= today);
  const yesterdayArticles = articles.filter(a => { const d = new Date(a.publishedAt); return d >= yesterday && d < today; });
  const thisWeekArticles = articles.filter(a => { const d = new Date(a.publishedAt); return d >= weekAgo && d < yesterday; });
  const earlierArticles = articles.filter(a => new Date(a.publishedAt) < weekAgo);

  if (todayArticles.length) groups.push({ label: 'Today', articles: todayArticles });
  if (yesterdayArticles.length) groups.push({ label: 'Yesterday', articles: yesterdayArticles });
  if (thisWeekArticles.length) groups.push({ label: 'This Week', articles: thisWeekArticles });
  if (earlierArticles.length) groups.push({ label: 'Earlier', articles: earlierArticles });

  return groups;
}

const SENTIMENT_COLORS = {
  Bullish: 'var(--accent-green)',
  Bearish: 'var(--accent-red)',
  Neutral: 'var(--accent-blue)',
};

const CATEGORY_COLORS = {
  Earnings: { bg: 'var(--accent-green-dim)', color: 'var(--accent-green)' },
  Analyst: { bg: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' },
  'M&A': { bg: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' },
  Regulatory: { bg: 'var(--accent-amber-dim)', color: 'var(--accent-amber)' },
  Product: { bg: 'rgba(0, 229, 160, 0.08)', color: '#00e5a0' },
  Market: { bg: 'rgba(79, 141, 255, 0.08)', color: '#4f8dff' },
  Insider: { bg: 'rgba(255, 209, 102, 0.08)', color: '#ffd166' },
  General: { bg: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' },
};

// ─── Sub-Components ─────────────────────────────────────────────────────────

function FreshnessBar({ dataUpdatedAt, refreshing, onRefresh }) {
  const ago = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 60000) : null;
  const label = ago === null ? '' : ago < 1 ? 'Updated just now' : `Updated ${ago}m ago`;

  return (
    <div style={styles.freshnessBar}>
      <span style={styles.freshnessText}>{label}</span>
      <button onClick={onRefresh} style={styles.refreshBtn} title="Refresh news">
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }}
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </button>
    </div>
  );
}

function AISummaryCard({ aiSummary, loading }) {
  if (loading) {
    return (
      <div style={{ ...styles.glassCard, position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-blue)' }}>
              <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
              <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
            </svg>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
              AI NEWS DIGEST
            </span>
          </div>
          <span style={{
            background: 'rgba(79,141,255, 0.15)',
            color: 'var(--accent-blue)',
            padding: '4px 10px',
            borderRadius: '0',
            fontFamily: 'var(--font-display)',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Loading...
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ height: '14px', background: 'rgba(255,255,255,0.06)', borderRadius: '0', width: '90%', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ height: '14px', background: 'rgba(255,255,255,0.06)', borderRadius: '0', width: '75%', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.1s' }} />
          <div style={{ height: '14px', background: 'rgba(255,255,255,0.06)', borderRadius: '0', width: '60%', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.2s' }} />
        </div>
      </div>
    );
  }

  if (!aiSummary) return null;

  const sentiment = aiSummary.sentiment || 'Neutral';
  const isBullish = sentiment === 'Bullish';
  const isBearish = sentiment === 'Bearish';
  const scoreColor = SENTIMENT_COLORS[sentiment] || SENTIMENT_COLORS.Neutral;
  const bgGradient = isBullish
    ? 'linear-gradient(135deg, rgba(0,229,160,0.1) 0%, rgba(0,229,160,0.02) 100%)'
    : isBearish
      ? 'linear-gradient(135deg, rgba(255,77,109,0.1) 0%, rgba(255,77,109,0.02) 100%)'
      : 'linear-gradient(135deg, rgba(79,141,255,0.1) 0%, rgba(79,141,255,0.02) 100%)';

  return (
    <div style={{ ...styles.glassCard, backgroundImage: bgGradient, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-blue)' }}>
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
          </svg>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
            AI NEWS DIGEST
          </span>
        </div>
        <span style={{
          background: `rgba(${isBullish ? '0,229,160' : isBearish ? '255,77,109' : '79,141,255'}, 0.15)`,
          color: scoreColor,
          padding: '4px 10px',
          borderRadius: '0',
          fontFamily: 'var(--font-display)',
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {sentiment}
        </span>
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', lineHeight: 1.6, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
        {aiSummary.summary}
      </p>
      <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Generated: {new Date().toLocaleDateString()} • Sources: Yahoo Finance
      </div>
    </div>
  );
}

function TimeGroupHeader({ label }) {
  return (
    <div style={styles.timeGroupHeader}>{label}</div>
  );
}

function NewsArticleCard({ article }) {
  const [hovered, setHovered] = useState(false);
  const sentiment = article.sentiment || 'Neutral';
  const sentimentColor = SENTIMENT_COLORS[sentiment] || SENTIMENT_COLORS.Neutral;
  const category = article.category || 'General';
  const catStyle = CATEGORY_COLORS[category] || CATEGORY_COLORS.General;

  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        ...styles.articleCard,
        borderColor: hovered ? 'rgba(255,255,255,0.14)' : 'var(--glass-border)',
        background: hovered ? 'rgba(255,255,255,0.055)' : 'var(--glass-bg)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      {article.thumbnail ? (
        <img
          src={article.thumbnail}
          alt=""
          style={styles.thumbnail}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      ) : (
        <div style={styles.thumbnailPlaceholder} />
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Row 1: sentiment + headline + time */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <div style={{ ...styles.sentimentDot, background: sentimentColor, marginTop: '4px', flexShrink: 0 }} />
          <span style={styles.headline}>{article.title}</span>
          <span style={styles.timeLabel}>{timeAgo(article.publishedAt)}</span>
        </div>

        {/* Row 2: category badge + publisher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '16px' }}>
          <span style={{ ...styles.categoryBadge, background: catStyle.bg, color: catStyle.color }}>{category}</span>
          {article.publisher && <span style={styles.publisher}>{article.publisher}</span>}
        </div>

        {/* Row 3: key quote */}
        {article.snippet && (
          <div style={styles.snippet}>
            {article.snippet}
          </div>
        )}
      </div>
    </a>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function NewsTab({ ticker }) {
  const { data, loading: newsLoading, error: newsError, refetch, dataUpdatedAt } = useStockNews(ticker);
  const { data: summaryData, loading: summaryLoading, error: summaryError } = useStockNewsSummary(ticker);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refetch().finally(() => setTimeout(() => setRefreshing(false), 1000));
  }, [refetch]);

  // Loading skeleton
  if (newsLoading && !data) {
    return (
      <div style={styles.skeletonContainer}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            height: i === 1 ? '150px' : '100px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: '0',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`,
          }} />
        ))}
      </div>
    );
  }

  // Error state
  if (newsError && !data) {
    return (
      <div style={styles.errorContainer}>
        <p>{newsError}</p>
        <button onClick={handleRefresh} style={styles.retryButton}>Try Again</button>
      </div>
    );
  }

  if (!data) return null;

  const { articles } = data;
  const groups = groupByTime(articles || []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <FreshnessBar dataUpdatedAt={dataUpdatedAt} refreshing={refreshing} onRefresh={handleRefresh} />
      <AISummaryCard aiSummary={summaryData} loading={summaryLoading} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {groups.map(group => (
          <div key={group.label}>
            <TimeGroupHeader label={group.label} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {group.articles.map((article, i) => (
                <NewsArticleCard key={i} article={article} />
              ))}
            </div>
          </div>
        ))}
        {(!articles || articles.length === 0) && (
          <div style={styles.emptyState}>
            No recent news found for this ticker.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  glassCard: {
    background: 'var(--glass-bg)',
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--glass-border)',
    borderRadius: '0',
    padding: '24px',
  },
  freshnessBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  freshnessText: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    letterSpacing: '0.02em',
  },
  refreshBtn: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '0',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px',
    transition: 'all 0.15s ease',
  },
  articleCard: {
    display: 'flex',
    gap: '16px',
    padding: '16px',
    borderRadius: '0',
    border: '1px solid var(--glass-border)',
    background: 'var(--glass-bg)',
    backdropFilter: 'blur(16px)',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'border-color 0.2s, background 0.2s',
  },
  thumbnail: {
    width: '80px',
    height: '80px',
    borderRadius: '0',
    objectFit: 'cover',
    flexShrink: 0,
  },
  thumbnailPlaceholder: {
    width: '80px',
    height: '80px',
    borderRadius: '0',
    flexShrink: 0,
    background: 'linear-gradient(135deg, rgba(79,141,255,0.08) 0%, rgba(155,109,255,0.08) 100%)',
  },
  sentimentDot: {
    width: '8px',
    height: '8px',
    borderRadius: '0',
  },
  headline: {
    fontFamily: 'var(--font-body)',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    lineHeight: 1.4,
    flex: 1,
    minWidth: 0,
  },
  timeLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  categoryBadge: {
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '2px 7px',
    borderRadius: '0',
  },
  publisher: {
    fontFamily: 'var(--font-body)',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  snippet: {
    fontFamily: 'var(--font-body)',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
    lineHeight: 1.5,
    paddingLeft: '16px',
    borderLeft: '2px solid rgba(255,255,255,0.06)',
    marginLeft: '0',
  },
  timeGroupHeader: {
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--text-secondary)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    paddingBottom: '6px',
    marginTop: '24px',
    marginBottom: '12px',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '150px',
    color: 'var(--text-muted)',
    fontSize: '12px',
    fontFamily: 'var(--font-body)',
    background: 'rgba(255,255,255,0.01)',
    borderRadius: '0',
    border: '1px dashed rgba(255,255,255,0.05)',
  },
  skeletonContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    padding: '20px 0',
  },
  errorContainer: {
    color: 'var(--accent-red)',
    fontFamily: 'var(--font-body)',
    fontSize: '13px',
    padding: '40px 0',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  retryButton: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '12px',
    padding: '8px 16px',
  },
};
