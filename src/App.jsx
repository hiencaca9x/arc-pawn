import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import { connectWallet, shortenAddress } from './wallet.js';

// ⚠️ THAY 2 địa chỉ này bằng địa chỉ thật sau khi deploy contract & biết USDC address trên Arc
const CONTRACT_ADDRESS = '0x00000000000000000000000000000000000000';
const USDC_ADDRESS = '0x00000000000000000000000000000000000000';

const CONTRACT_ABI = [
  "function createOffer(address collateralAsset, uint256 collateralId, uint8 assetType, address loanAsset, uint256 loanAmount, uint256 feeBps, uint256 duration) external returns (uint256)",
  "function matchOffer(uint256 id) external",
  "function repay(uint256 id) external",
  "function liquidate(uint256 id) external",
  "function cancelOffer(uint256 id) external",
  "function offers(uint256) external view returns (address borrower, address collateralAsset, uint256 collateralId, uint8 assetType, address loanAsset, uint256 loanAmount, uint256 feeBps, uint256 duration, address lender, uint256 matchedAt, uint8 status)",
  "function offerCount() external view returns (uint256)",
  "function getReputation(address user) external view returns (uint256 onTime, uint256 defaulted)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)"
];

const STATUS_LABELS = ['status_open', 'status_matched', 'status_repaid', 'status_liquidated', 'status_cancelled'];
const LANGS = [
  { code: 'vi', label: '🇻🇳 VI' },
  { code: 'en', label: '🇺🇸 EN' },
  { code: 'zh', label: '🇨🇳 ZH' },
  { code: 'ko', label: '🇰🇷 KO' },
  { code: 'ja', label: '🇯🇵 JA' }
];

export default function App() {
  const { t, i18n } = useTranslation();
  const [wallet, setWallet] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState('');
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('browse');
  const [reputation, setReputation] = useState({ onTime: 0, defaulted: 0 });

  const [form, setForm] = useState({
    collateralAsset: '',
    collateralId: '',
    assetType: '0',
    loanAmount: '',
    feeBps: '500',
    durationDays: '30'
  });

  async function handleConnect() {
    try {
      setLoading(true);
      const { signer, address } = await connectWallet();
      setSigner(signer);
      setAddress(address);
      setWallet(true);
    } catch (err) {
      console.error(err);
      alert(t('transaction_failed'));
    } finally {
      setLoading(false);
    }
  }

  function getContract(signerOrProvider) {
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerOrProvider);
  }

  async function loadOffers() {
    if (!signer) return;
    try {
      const contract = getContract(signer);
      const count = await contract.offerCount();
      const list = [];
      for (let i = 0; i < Number(count); i++) {
        const o = await contract.offers(i);
        list.push({
          id: i,
          borrower: o.borrower,
          collateralAsset: o.collateralAsset,
          collateralId: o.collateralId.toString(),
          assetType: Number(o.assetType),
          loanAsset: o.loanAsset,
          loanAmount: o.loanAmount,
          feeBps: Number(o.feeBps),
          duration: Number(o.duration),
          lender: o.lender,
          matchedAt: Number(o.matchedAt),
          status: Number(o.status)
        });
      }
      setOffers(list.reverse());
    } catch (err) {
      console.error(err);
    }
  }

  async function loadReputation() {
    if (!signer || !address) return;
    try {
      const contract = getContract(signer);
      const [onTime, defaulted] = await contract.getReputation(address);
      setReputation({ onTime: Number(onTime), defaulted: Number(defaulted) });
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (signer) {
      loadOffers();
      loadReputation();
    }
  }, [signer]);

  async function handleCreateOffer(e) {
    e.preventDefault();
    if (!signer) return alert(t('wallet_not_connected'));
    try {
      setLoading(true);
      const contract = getContract(signer);
      const durationSeconds = Number(form.durationDays) * 86400;
      const loanAmountParsed = ethers.parseUnits(form.loanAmount || '0', 6); // USDC = 6 decimals

      // approve collateral transfer trước
      const collateralContract = new ethers.Contract(form.collateralAsset, ERC20_ABI, signer);
      if (form.assetType === '1') {
        const tx0 = await collateralContract.approve(CONTRACT_ADDRESS, form.collateralId);
        await tx0.wait();
      }

      const tx = await contract.createOffer(
        form.collateralAsset,
        form.collateralId,
        Number(form.assetType),
        USDC_ADDRESS,
        loanAmountParsed,
        Number(form.feeBps),
        durationSeconds
      );
      await tx.wait();
      alert(t('transaction_success'));
      setForm({ collateralAsset: '', collateralId: '', assetType: '0', loanAmount: '', feeBps: '500', durationDays: '30' });
      loadOffers();
      setTab('browse');
    } catch (err) {
      console.error(err);
      alert(t('transaction_failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleMatch(offer) {
    if (!signer) return alert(t('wallet_not_connected'));
    try {
      setLoading(true);
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
      const approveTx = await usdc.approve(CONTRACT_ADDRESS, offer.loanAmount);
      await approveTx.wait();

      const contract = getContract(signer);
      const tx = await contract.matchOffer(offer.id);
      await tx.wait();
      alert(t('transaction_success'));
      loadOffers();
    } catch (err) {
      console.error(err);
      alert(t('transaction_failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleRepay(offer) {
    if (!signer) return alert(t('wallet_not_connected'));
    try {
      setLoading(true);
      const fee = (offer.loanAmount * BigInt(offer.feeBps)) / 10000n;
      const totalOwed = offer.loanAmount + fee;
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
      const approveTx = await usdc.approve(CONTRACT_ADDRESS, totalOwed);
      await approveTx.wait();

      const contract = getContract(signer);
      const tx = await contract.repay(offer.id);
      await tx.wait();
      alert(t('transaction_success'));
      loadOffers();
      loadReputation();
    } catch (err) {
      console.error(err);
      alert(t('transaction_failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleLiquidate(offer) {
    if (!signer) return alert(t('wallet_not_connected'));
    try {
      setLoading(true);
      const contract = getContract(signer);
      const tx = await contract.liquidate(offer.id);
      await tx.wait();
      alert(t('transaction_success'));
      loadOffers();
    } catch (err) {
      console.error(err);
      alert(t('transaction_failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(offer) {
    if (!signer) return alert(t('wallet_not_connected'));
    try {
      setLoading(true);
      const contract = getContract(signer);
      const tx = await contract.cancelOffer(offer.id);
      await tx.wait();
      alert(t('transaction_success'));
      loadOffers();
    } catch (err) {
      console.error(err);
      alert(t('transaction_failed'));
    } finally {
      setLoading(false);
    }
  }

  function formatExpiry(offer) {
    if (offer.status !== 1) return '-';
    const expiresAt = offer.matchedAt + offer.duration;
    const now = Math.floor(Date.now() / 1000);
    if (now > expiresAt) return t('expired');
    const daysLeft = Math.ceil((expiresAt - now) / 86400);
    return `${daysLeft} ${t('duration_days').toLowerCase()}`;
  }

  const isExpired = (offer) => {
    if (offer.status !== 1) return false;
    return Math.floor(Date.now() / 1000) > offer.matchedAt + offer.duration;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">{t('app_name')}</h1>
        <div className="flex items-center gap-2">
          <select
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="text-sm border rounded px-2 py-1 bg-white"
          >
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          {!wallet ? (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="bg-black text-white text-sm px-3 py-1.5 rounded-lg"
            >
              {t('connect_wallet')}
            </button>
          ) : (
            <span className="text-sm bg-gray-100 px-3 py-1.5 rounded-lg font-mono">
              {shortenAddress(address)}
            </span>
          )}
        </div>
      </header>

      <p className="text-center text-xs text-gray-400 py-2 px-4">{t('tagline')}</p>

      {/* Reputation bar */}
      {wallet && (
        <div className="mx-4 mb-3 bg-white border rounded-lg px-4 py-2 flex justify-between text-sm">
          <span className="text-gray-500">{t('reputation')}</span>
          <span>
            ✅ {reputation.onTime} &nbsp; ❌ {reputation.defaulted}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex mx-4 mb-3 bg-white border rounded-lg overflow-hidden">
        <button
          onClick={() => setTab('browse')}
          className={`flex-1 py-2 text-sm font-medium ${tab === 'browse' ? 'bg-black text-white' : 'text-gray-600'}`}
        >
          {t('browse_offers')}
        </button>
        <button
          onClick={() => setTab('create')}
          className={`flex-1 py-2 text-sm font-medium ${tab === 'create' ? 'bg-black text-white' : 'text-gray-600'}`}
        >
          {t('create_offer')}
        </button>
      </div>

      <main className="px-4 pb-10">
        {tab === 'create' && (
          <form onSubmit={handleCreateOffer} className="bg-white border rounded-lg p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500">{t('collateral_type')}</label>
              <select
                value={form.assetType}
                onChange={e => setForm({ ...form, assetType: e.target.value })}
                className="w-full border rounded px-3 py-2 mt-1"
              >
                <option value="0">ERC721 (NFT)</option>
                <option value="1">ERC20 (Token)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('collateral_address')}</label>
              <input
                required
                value={form.collateralAsset}
                onChange={e => setForm({ ...form, collateralAsset: e.target.value })}
                placeholder="0x..."
                className="w-full border rounded px-3 py-2 mt-1 font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('collateral_id')}</label>
              <input
                required
                value={form.collateralId}
                onChange={e => setForm({ ...form, collateralId: e.target.value })}
                placeholder="0"
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('loan_amount')}</label>
              <input
                required
                type="number"
                value={form.loanAmount}
                onChange={e => setForm({ ...form, loanAmount: e.target.value })}
                placeholder="300"
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">{t('fee_percent')}</label>
                <input
                  type="number"
                  value={Number(form.feeBps) / 100}
                  onChange={e => setForm({ ...form, feeBps: String(Number(e.target.value) * 100) })}
                  className="w-full border rounded px-3 py-2 mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('duration_days')}</label>
                <input
                  type="number"
                  value={form.durationDays}
                  onChange={e => setForm({ ...form, durationDays: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !wallet}
              className="w-full bg-black text-white py-2.5 rounded-lg font-medium mt-2 disabled:opacity-50"
            >
              {loading ? t('loading') : t('submit')}
            </button>
          </form>
        )}

        {tab === 'browse' && (
          <div className="space-y-3">
            {offers.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-10">
                {wallet ? '—' : t('wallet_not_connected')}
              </p>
            )}
            {offers.map(offer => (
              <div key={offer.id} className="bg-white border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono text-gray-400">#{offer.id}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">
                    {t(STATUS_LABELS[offer.status])}
                  </span>
                </div>
                <div className="text-sm space-y-1 text-gray-700">
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('loan_amount')}</span>
                    <span className="font-medium">{ethers.formatUnits(offer.loanAmount, 6)} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('fee_percent')}</span>
                    <span>{offer.feeBps / 100}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('duration_days')}</span>
                    <span>{offer.duration / 86400}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('borrower')}</span>
                    <span className="font-mono text-xs">{shortenAddress(offer.borrower)}</span>
                  </div>
                  {offer.status === 1 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">{t('expires_in')}</span>
                      <span className={isExpired(offer) ? 'text-red-500' : ''}>{formatExpiry(offer)}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-3">
                  {offer.status === 0 && offer.borrower.toLowerCase() !== address.toLowerCase() && (
                    <button onClick={() => handleMatch(offer)} disabled={loading} className="flex-1 bg-black text-white text-sm py-2 rounded-lg">
                      {t('match_offer')}
                    </button>
                  )}
                  {offer.status === 0 && offer.borrower.toLowerCase() === address.toLowerCase() && (
                    <button onClick={() => handleCancel(offer)} disabled={loading} className="flex-1 border text-sm py-2 rounded-lg">
                      {t('cancel_offer')}
                    </button>
                  )}
                  {offer.status === 1 && !isExpired(offer) && offer.borrower.toLowerCase() === address.toLowerCase() && (
                    <button onClick={() => handleRepay(offer)} disabled={loading} className="flex-1 bg-black text-white text-sm py-2 rounded-lg">
                      {t('repay')}
                    </button>
                  )}
                  {offer.status === 1 && isExpired(offer) && (
                    <button onClick={() => handleLiquidate(offer)} disabled={loading} className="flex-1 bg-red-500 text-white text-sm py-2 rounded-lg">
                      {t('liquidate')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
