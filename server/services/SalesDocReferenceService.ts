import { SalesDocClient } from '../client/SalesDocClient.js';
import {
  SalesDocAgent,
  SalesDocBrand,
  SalesDocExpeditor,
  SalesDocFilial,
  SalesDocTerritory
} from '../types/salesdoc.types.js';

export class SalesDocReferenceService {
  private client: SalesDocClient;

  constructor(client?: SalesDocClient) {
    this.client = client || SalesDocClient.getInstance();
  }

  /**
   * 9.39 / 15.1. getFilials - List all filials
   */
  public async getFilials() {
    return this.client.request<{ filial: SalesDocFilial[] }>('getFilials');
  }

  /**
   * 9.11. getAgent - Agents
   */
  public async getAgents(params: any = {}) {
    return this.client.request<{ agent: SalesDocAgent[] }>('getAgent', params);
  }

  /**
   * 9.12. getExpeditor - Expeditors
   */
  public async getExpeditors(params: any = {}) {
    return this.client.request<{ expeditor: SalesDocExpeditor[] }>('getExpeditor', params);
  }

  /**
   * 9.13. getSupervisor - Supervisors
   */
  public async getSupervisors(params: any = {}) {
    return this.client.request<{ supervisor: any[] }>('getSupervisor', params);
  }

  /**
   * 9.16. getTerritory - Territories (cities)
   */
  public async getTerritories(params: any = {}) {
    return this.client.request<{ territory: SalesDocTerritory[] }>('getTerritory', params);
  }

  /**
   * 9.17. getBrand - Brands
   */
  public async getBrands(params: any = {}) {
    return this.client.request<{ brand: SalesDocBrand[] }>('getBrand', params);
  }

  /**
   * 10.15. setAgent - Create/update agents (e.g. activate/block agent access in SalesDoc)
   */
  public async setAgents(
    agents: Array<{
      CS_id?: string;
      SD_id?: string;
      code_1C?: string;
      name: string;
      active?: boolean | string;
    }>
  ) {
    return this.client.request('setAgent', undefined, { agent: agents });
  }

  /**
   * Activate or deactivate (block) a SalesDoc agent profile safely by preserving its exact identifiers and name.
   */
  public async setAgentActiveStatus(
    agentId: string,
    active: boolean,
    fallbackInfo?: { name?: string; code_1C?: string }
  ): Promise<{
    agentId: string;
    name: string;
    active: boolean;
    salesdocResult: any;
  }> {
    let matched: any = null;
    try {
      const agentsRes = await this.getAgents();
      const list = agentsRes?.result?.agent || [];
      matched = list.find(
        (ag: any) =>
          ag?.SD_id === agentId ||
          ag?.CS_id === agentId ||
          ag?.code_1C === agentId ||
          (ag as any)?.id === agentId
      );
    } catch (err: any) {
      if (!fallbackInfo?.name) {
        throw err;
      }
    }

    const resolvedName = (matched?.name || fallbackInfo?.name || '').trim();
    if (!resolvedName) {
      throw new Error(`Agent topilmadi (${agentId}) va nomi ko'rsatilmagan.`);
    }

    const payloadItem: {
      CS_id?: string;
      SD_id?: string;
      code_1C?: string;
      name: string;
      active: boolean;
    } = {
      name: resolvedName,
      active
    };

    if (matched?.CS_id) payloadItem.CS_id = String(matched.CS_id);
    if (matched?.SD_id) payloadItem.SD_id = String(matched.SD_id);
    if (matched?.code_1C || fallbackInfo?.code_1C) {
      payloadItem.code_1C = String(matched?.code_1C || fallbackInfo?.code_1C);
    }
    if (!payloadItem.CS_id && !payloadItem.SD_id && !payloadItem.code_1C) {
      payloadItem.SD_id = agentId;
    }

    const salesdocResult = await this.setAgents([payloadItem]);
    return {
      agentId: payloadItem.SD_id || payloadItem.CS_id || agentId,
      name: resolvedName,
      active,
      salesdocResult
    };
  }

  /**
   * 9.21. getVisit - Visits by agents with GPS and order details
   */
  public async getVisits(params: {
    filter?: {
      period?: {
        date?: { from?: string; to?: string };
      };
    };
  } = {}) {
    return this.client.request<{ visit: any[] }>('getVisit', params);
  }
}
