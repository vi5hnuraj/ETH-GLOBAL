-- Platform Fees Table
-- Tracks all commission fees collected by GlobalPay from marketplace transactions
-- and agent store purchases.

CREATE TABLE IF NOT EXISTS platform_fees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fee_id TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('marketplace', 'agent_store', 'subscription', 'gas_markup')),
  
  -- Reference to the source transaction
  invoice_id TEXT,
  subscription_id TEXT,
  installation_id TEXT,
  
  -- Agent details
  consumer_agent_code TEXT,
  provider_agent_code TEXT,
  service_code TEXT,
  
  -- Fee breakdown (all in wei)
  total_amount_wei TEXT NOT NULL,
  platform_fee_wei TEXT NOT NULL,
  provider_amount_wei TEXT,
  fee_percentage INTEGER NOT NULL DEFAULT 5,
  
  -- Treasury info
  treasury_address TEXT,
  
  -- Transaction tracking
  tx_hash TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'settled', 'refunded')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_platform_fees_status ON platform_fees(status);
CREATE INDEX IF NOT EXISTS idx_platform_fees_source ON platform_fees(source);
CREATE INDEX IF NOT EXISTS idx_platform_fees_created ON platform_fees(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_fees_treasury ON platform_fees(treasury_address);

-- Platform Revenue Summary View (for admin dashboard)
CREATE OR REPLACE VIEW platform_revenue_summary AS
SELECT
  source,
  DATE(created_at) as date,
  COUNT(*) as transaction_count,
  SUM(platform_fee_wei::NUMERIC) / 1e18 as total_fee_bot,
  SUM(total_amount_wei::NUMERIC) / 1e18 as total_volume_bot,
  ROUND(AVG(fee_percentage::NUMERIC), 2) as avg_fee_pct
FROM platform_fees
WHERE status = 'collected'
GROUP BY source, DATE(created_at)
ORDER BY date DESC;

COMMENT ON TABLE platform_fees IS 'Tracks platform commission fees from marketplace transactions and agent store purchases';
COMMENT ON COLUMN platform_fees.source IS 'Where the fee came from: marketplace (5%), agent_store (7%), subscription, or gas_markup';
COMMENT ON COLUMN platform_fees.platform_fee_wei IS 'The commission amount in wei that goes to GlobalPay treasury';
COMMENT ON COLUMN platform_fees.provider_amount_wei IS 'The amount in wei that goes to the service/agent provider';
