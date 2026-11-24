import { SalesDocClient } from '../client/SalesDocClient.js';
import { SalesDocMapper } from '../mappers/salesdoc.mapper.js';
import { LocalDb } from '../storage/localDb.js';
import {
  LocalCustomer,
  SalesDocClient as SalesDocClientType,
  SalesDocClientCategory,
  SalesDocClientChannel,
  SalesDocClientType as SDClientType,
  SalesDocSetResult
} from '../types/salesdoc.types.js';

export class SalesDocClientService {
  private client: SalesDocClient;
  private db: LocalDb;

  constructor(client?: SalesDocClient, db?: LocalDb) {
    this.client = client || SalesDocClient.getInstance();
    this.db = db || LocalDb.getInstance();
  }

  /**
   * 9.7. getClient - Client list with filters and pagination
   */
  public async getClients(params: {
    limit?: number;
    page?: number;
    search?: string;
    filter?: any;
  } = {}) {
    return this.client.request<{ client: SalesDocClientType[] }>('getClient', params);
  }

  /**
   * 9.8. getClientCategory - Categories
   */
  public async getClientCategories(params: any = {}) {
    return this.client.request<{ clientCategory: SalesDocClientCategory[] }>('getClientCategory', params);
  }

  /**
   * 9.9. getClientType - Client types
   */
  public async getClientTypes(params: any = {}) {
    return this.client.request<{ clientType: SDClientType[] }>('getClientType', params);
  }

  /**
   * 9.10. getClientChannel - Sales channels
   */
  public async getClientChannels(params: any = {}) {
    return this.client.request<{ clientChannel: SalesDocClientChannel[] }>('getClientChannel', params);
  }

  /**
   * 10.17. setClient - Create/update clients
   */
  public async setClient(clients: any[]) {
    return this.client.request<SalesDocSetResult>('setClient', undefined, { client: clients });
  }

  /**
   * 10.18. setClientPhone - Set additional client phone numbers (max 2)
   */
  public async setClientPhone(clientPhones: Array<{ code_1C?: string; SD_id?: string; CS_id?: string; phone_numbers: string[] }>) {
    return this.client.request<SalesDocSetResult>('setClientPhone', undefined, { client_phone: clientPhones });
  }

  /**
   * Sync all clients from SalesDoc into local database
   */
  public async syncFromSalesDoc(): Promise<{ processed: number; failed: number }> {
    const start = Date.now();
    try {
      const categoryMap = new Map<string, string>();
      try {
        const catRes = await this.getClientCategories();
        for (const c of catRes.result?.clientCategory || []) {
          if (c.name) {
            if (c.SD_id) categoryMap.set(c.SD_id, c.name);
            if (c.CS_id) categoryMap.set(c.CS_id, c.name);
            if (c.code_1C) categoryMap.set(c.code_1C, c.name);
          }
        }
      } catch {
        // Optional category enrichment
      }

      const remoteClients = await this.client.fetchAllPages<SalesDocClientType>(
        'getClient',
        {},
        (result) => result?.client || [],
        200,
        10
      );

      const mappedClients = remoteClients.map((remote) => SalesDocMapper.toLocalCustomer(remote, undefined, { categoryMap }));
      const processed = this.db.upsertClientsBatch(mappedClients);

      this.db.addSyncLog({
        method: 'getClient',
        direction: 'inbound',
        entity: 'client',
        records_processed: processed,
        records_failed: 0,
        status: 'success',
        duration_ms: Date.now() - start
      });

      return { processed, failed: 0 };
    } catch (err: any) {
      this.db.addSyncLog({
        method: 'getClient',
        direction: 'inbound',
        entity: 'client',
        records_processed: 0,
        records_failed: 1,
        status: 'failed',
        duration_ms: Date.now() - start,
        error_message: err.message
      });
      throw err;
    }
  }

  /**
   * Push a local customer to SalesDoc
   */
  public async pushToSalesDoc(clientId: string): Promise<LocalCustomer> {
    const customer = this.db.getClientById(clientId);
    if (!customer) {
      throw new Error(`Customer not found with ID: ${clientId}`);
    }

    const payload = SalesDocMapper.toSalesDocClientPayload(customer);
    const start = Date.now();

    try {
      const response = await this.setClient([payload]);
      const isSuccess = response.status && (response.result?.error === 0 || response.result?.completed > 0);

      const updated: LocalCustomer = {
        ...customer,
        sync_status: isSuccess ? 'synced' : 'failed',
        last_synced_at: new Date().toISOString(),
        last_error: isSuccess ? undefined : 'Failed to register client in SalesDoc'
      };

      this.db.upsertClient(updated);
      this.db.addSyncLog({
        method: 'setClient',
        direction: 'outbound',
        entity: 'client',
        records_processed: 1,
        records_failed: isSuccess ? 0 : 1,
        status: isSuccess ? 'success' : 'failed',
        duration_ms: Date.now() - start
      });

      return updated;
    } catch (err: any) {
      const failedCustomer: LocalCustomer = {
        ...customer,
        sync_status: 'failed',
        last_error: err.message
      };
      this.db.upsertClient(failedCustomer);
      this.db.addSyncLog({
        method: 'setClient',
        direction: 'outbound',
        entity: 'client',
        records_processed: 0,
        records_failed: 1,
        status: 'failed',
        duration_ms: Date.now() - start,
        error_message: err.message
      });
      throw err;
    }
  }
}
