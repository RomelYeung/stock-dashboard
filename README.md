# Stock Dashboard

A full-stack web application for monitoring and managing a stock portfolio in real-time. Track your favorite stocks with live price updates, detailed financial metrics, and portfolio analytics.

![Portfolio Monitor](./screenshot.png)

## Features

- **Real-time Stock Tracking**: Monitor multiple stocks with live price updates
- **Comprehensive Financial Metrics**: View market cap, P/E ratio, dividend yield, and more
- **Portfolio Management**: Add/remove stocks from your watchlist
- **Stock Details**: Detailed information modal for each stock with historical data
- **Charts & Visualization**: Interactive charts powered by Recharts
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Tech Stack

### Frontend
- **React** - UI library
- **Vite** - Build tool and dev server
- **Recharts** - Interactive charts and graphs
- **CSS3** - Styling

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **Yahoo Finance API** - Real-time stock data
- **Redis** - Caching for improved performance

## Getting Started

### Prerequisites
- Node.js (v14+)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/RomelYeung/stock-dashboard.git
cd stock-dashboard
```

2. Install backend dependencies
```bash
cd backend
npm install
```

3. Install frontend dependencies
```bash
cd ../frontend
npm install
```

### Running the Application

1. Start the backend server
```bash
cd backend
npm run dev
# Server runs on http://localhost:3000
```

2. In another terminal, start the frontend development server
```bash
cd frontend
npm run dev
# Frontend runs on http://localhost:3001
```

3. Open your browser and navigate to `http://localhost:3001`

## Project Structure

```
stock-dashboard/
├── backend/
│   ├── routes/
│   │   └── stocks.js
│   ├── services/
│   │   ├── cache.js
│   │   └── yahoofinance.js
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Charts.jsx
│   │   │   ├── PortfolioManager.jsx
│   │   │   ├── StockCard.jsx
│   │   │   └── StockDetailModal.jsx
│   │   ├── hooks/
│   │   │   └── useStockData.js
│   │   ├── styles/
│   │   │   └── index.css
│   │   ├── utils/
│   │   │   └── formatters.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## Available Scripts

### Backend
- `npm run dev` - Start development server
- `npm test` - Run tests

### Frontend
- `npm run dev` - Start development server with Vite
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Features in Detail

### Stock Cards
Each stock card displays:
- Current price with percentage change
- Company name
- Market cap
- P/E (Price-to-Earnings) ratio
- Forward P/E
- EV/EBITDA ratio
- P/B (Price-to-Book) ratio
- 52-week price range

### Portfolio Analytics
- Real-time portfolio value calculation
- Performance tracking
- Historical data visualization

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the MIT License.

## Support

For issues and questions, please open an issue on the [GitHub repository](https://github.com/RomelYeung/stock-dashboard/issues).
