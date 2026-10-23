import { useEffect } from 'react';
import * as Network from 'expo-network';

import { syncNow } from '@/services/sync';
import { useAuth } from './useAuth';

export function useAutoSyncOnReconnect(): void {
  const { user } = useAuth();
  const userId = user?.id;
  const userRole = user?.role;
  const userStatus = user?.status;
  const facilityId = user?.facilityId;

  useEffect(() => {
    if (!user || userStatus !== 'active') return undefined;

    let disposed = false;
    let syncing = false;
    let wasOnline: boolean | null = null;
    let receivedNetworkEvent = false;

    const isOnline = (state: Network.NetworkState) =>
      state.isConnected === true && state.isInternetReachable !== false;

    const runSync = async () => {
      if (disposed || syncing) return;
      syncing = true;
      try {
        await syncNow(user);
      } finally {
        syncing = false;
      }
    };

    const handleNetworkState = (state: Network.NetworkState) => {
      const online = isOnline(state);
      if (online && (wasOnline === null || wasOnline === false)) void runSync();
      wasOnline = online;
    };

    const subscription = Network.addNetworkStateListener((state) => {
      receivedNetworkEvent = true;
      handleNetworkState(state);
    });

    void Network.getNetworkStateAsync()
      .then((state) => {
        if (!disposed && !receivedNetworkEvent) handleNetworkState(state);
      })
      .catch(() => {
        if (!disposed) wasOnline = false;
      });

    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [userId, userRole, userStatus, facilityId]);
}