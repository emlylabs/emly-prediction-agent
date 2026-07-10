import { useState, useEffect } from 'react';
import './HealthDashboard.css';

function HealthDashboard() {
    const [basicHealth, setBasicHealth] = useState(null);
    const [detailedHealth, setDetailedHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchHealthData = async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch basic health
            const basicResponse = await fetch('/api/status');
            if (!basicResponse.ok) throw new Error('Failed to fetch basic health');
            const basicData = await basicResponse.json();
            setBasicHealth(basicData);

            // Fetch detailed health
            const detailedResponse = await fetch('/health');
            if (!detailedResponse.ok) throw new Error('Failed to fetch detailed health');
            const detailedData = await detailedResponse.json();
            setDetailedHealth(detailedData);

            setLastUpdated(new Date().toLocaleTimeString());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHealthData();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchHealthData, 30000);
        return () => clearInterval(interval);
    }, []);

    const getStatusColor = (percent) => {
        if (percent < 50) return 'status-good';
        if (percent < 80) return 'status-warning';
        return 'status-critical';
    };

    const ProgressBar = ({ value, label }) => (
        <div className="progress-container">
            <div className="progress-label">
                <span>{label}</span>
                <span>{value?.toFixed(1)}%</span>
            </div>
            <div className="progress-bar">
                <div
                    className={`progress-fill ${getStatusColor(value)}`}
                    style={{ width: `${Math.min(value, 100)}%` }}
                />
            </div>
        </div>
    );

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <div className="header-content">
                    <div className="logo">
                        <span className="logo-icon">⚡</span>
                        <h1>Health Monitor</h1>
                    </div>
                    <div className="header-actions">
                        {lastUpdated && (
                            <span className="last-updated">Last updated: {lastUpdated}</span>
                        )}
                        <button
                            className="refresh-btn"
                            onClick={fetchHealthData}
                            disabled={loading}
                        >
                            {loading ? '⟳ Refreshing...' : '⟳ Refresh'}
                        </button>
                    </div>
                </div>
            </header>

            <main className="dashboard-main">
                {error && (
                    <div className="error-message">
                        <span className="error-icon">⚠️</span>
                        <span>{error}</span>
                        <button onClick={fetchHealthData}>Retry</button>
                    </div>
                )}

                {/* Basic Health Status */}
                {basicHealth && (
                    <section className="health-card status-card">
                        <div className="card-header">
                            <h2>Application Status</h2>
                            <span className={`status-badge ${basicHealth.status === 'healthy' ? 'healthy' : 'unhealthy'}`}>
                                {basicHealth.status === 'healthy' ? '● Healthy' : '○ Unhealthy'}
                            </span>
                        </div>
                        <div className="app-info">
                            <div className="info-item">
                                <span className="info-label">Application</span>
                                <span className="info-value">{basicHealth.app}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Version</span>
                                <span className="info-value">{basicHealth.version}</span>
                            </div>
                        </div>
                    </section>
                )}

                {/* Detailed Resource Metrics */}
                {detailedHealth && (
                    <div className="metrics-grid">
                        {/* CPU Card */}
                        <section className="health-card metric-card">
                            <div className="card-header">
                                <div className="metric-icon cpu-icon">🔲</div>
                                <h2>CPU</h2>
                            </div>
                            <div className="metric-content">
                                <div className="metric-value">
                                    <span className="value">{detailedHealth.cpu.limit_cores}</span>
                                    <span className="unit">cores</span>
                                </div>
                                <ProgressBar
                                    value={detailedHealth.cpu.usage_percent}
                                    label="Cpu Usage"
                                />
                            </div>
                        </section>

                        {/* Memory Card */}
                        <section className="health-card metric-card">
                            <div className="card-header">
                                <div className="metric-icon memory-icon">💾</div>
                                <h2>Memory</h2>
                            </div>
                            <div className="metric-content">
                                <div className="metric-stats">
                                    <div className="stat">
                                        <span className="stat-label">Used</span>
                                        <span className="stat-value">{detailedHealth.memory.used_gb} GB</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-label">Limit</span>
                                        <span className="stat-value">{detailedHealth.memory.limit_gb} GB</span>
                                    </div>
                                </div>
                                <ProgressBar
                                    value={detailedHealth.memory.usage_of_limit_percent}
                                    label="Usage of Limit"
                                />
                            </div>
                        </section>

                        {/* Disk Card */}
                        <section className="health-card metric-card">
                            <div className="card-header">
                                <div className="metric-icon disk-icon">💿</div>
                                <h2>Disk</h2>
                            </div>
                            <div className="metric-content">
                                <div className="metric-stats">
                                    <div className="stat">
                                        <span className="stat-label">Used</span>
                                        <span className="stat-value">{detailedHealth.disk.used_gb} GB</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-label">Free</span>
                                        <span className="stat-value">{detailedHealth.disk.free_gb} GB</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-label">Total</span>
                                        <span className="stat-value">{detailedHealth.disk.total_gb} GB</span>
                                    </div>
                                </div>
                                <ProgressBar
                                    value={detailedHealth.disk.usage_percent}
                                    label="Disk Usage"
                                />
                                {detailedHealth.disk.note && (
                                    <div className="disk-note">{detailedHealth.disk.note}</div>
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {loading && !basicHealth && (
                    <div className="loading-container">
                        <div className="loading-spinner"></div>
                        <p>Loading health data...</p>
                    </div>
                )}
            </main>

            <footer className="dashboard-footer">
                <p>Health API Dashboard • Auto-refreshes every 30 seconds</p>
            </footer>
        </div>
    );
}

export default HealthDashboard;
