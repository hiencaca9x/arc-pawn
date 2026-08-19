import { ethers } from 'ethers';
import { EthereumProvider } from '@walletconnect/ethereum-provider';

// TODO: thay các giá trị này bằng thông tin thật của Arc network
export const ARC_CHAIN_ID = 1234;
export const ARC_RPC_URL = 'https://rpc.arc.network';
export const ARC_CHAIN_ID_HEX = '0x' + ARC_CHAIN_ID.toString(16);

let cachedProvider = null;

export async function connectWallet() {
  // Trường hợp 1: có ví injected (MetaMask extension trên desktop,
  // hoặc trong-app browser của ví mobile như MetaMask app, Trust Wallet app)
  if (window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);

    // đảm bảo đúng network Arc
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CHAIN_ID_HEX }],
      });
    } catch (switchError) {
      // network chưa có trong ví -> thêm mới
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: ARC_CHAIN_ID_HEX,
            chainName: 'Arc',
            rpcUrls: [ARC_RPC_URL],
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          }],
        });
      }
    }

    const signer = await provider.getSigner();
    cachedProvider = provider;
    return { provider, signer, address: await signer.getAddress() };
  }

  // Trường hợp 2: không có ví injected -> WalletConnect
  // (hiện QR code trên desktop Safari/Chrome, deep-link mở app ví trên mobile)
  const wcProvider = await EthereumProvider.init({
    projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
    chains: [ARC_CHAIN_ID],
    rpcMap: { [ARC_CHAIN_ID]: ARC_RPC_URL },
    showQrModal: true,
  });

  await wcProvider.enable();
  const provider = new ethers.BrowserProvider(wcProvider);
  const signer = await provider.getSigner();
  cachedProvider = provider;
  return { provider, signer, address: await signer.getAddress() };
}

export function shortenAddress(address) {
  if (!address) return '';
  return address.slice(0, 6) + '...' + address.slice(-4);
}
