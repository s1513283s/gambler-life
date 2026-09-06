import { useEffect, useState } from 'react';
import { loadCompanyNames, loadStockSegments } from '../../data/loaders';
import { formatMoney } from '../../engine/death';
import { useGame } from '../../store';
import { stockMarketValue } from '../../venues/stocks';
import { StockList } from '../components/StockList';

interface Props {
  onClose: () => void;
}

export function StocksScreen({ onClose }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const [loadError, setLoadError] = useState(false);
  const marketReady = state.stockMarket !== null;

  // 第一次開股票畫面才建市場，之後整局固定
  useEffect(() => {
    if (marketReady) return;
    Promise.all([loadStockSegments(), loadCompanyNames()]).then(
      ([pool, names]) => dispatch({ type: 'STOCK_OPEN_MARKET', pool, names }),
      () => setLoadError(true),
    );
  }, [marketReady, dispatch]);

  return (
    <main className="screen">
      <section className="card">
        <h2>股票</h2>
        <div className="kv">
          <span className="muted">持股市值</span>
          <span>${formatMoney(stockMarketValue(state))}</span>
        </div>
        <p className="muted small">每天晚上收盤。付不出開銷時可以砍倉補現金。</p>
        {loadError && <p className="danger">資料載入失敗。</p>}
      </section>

      <StockList sellOnly={false} />

      <div className="spacer" />
      <button className="btn" onClick={onClose}>
        離開
      </button>
    </main>
  );
}
