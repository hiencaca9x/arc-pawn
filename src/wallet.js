import { ethers } from 'ethers';
import { EthereumProvider } from '@walletconnect/ethereum-provider';

export const ARC_CHAIN_ID = 5042002;
export const ARC_RPC_URL = 'https://rpc.testnet.arc.io';
export const ARC_CHAIN_ID_HEX = '0x' + ARC_CHAIN_ID.toString(16);

let cachedProvider = null;

export async function connectWallet() {
  if (window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CHAIN_ID_HEX }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: ARC_CHAIN_ID_HEX,
            chainName: 'Arc Testnet',
            rpcUrls: [ARC_RPC_URL],
            nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
            blockExplorerUrls: ['https://testnet.arcscan.app'],
          }],
        });
      }
    }

    const signer = await provider.getSigner();
    cachedProvider = provider;
    return { provider, signer, address: await signer.getAddress() };
  }

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
