/**
 * Phala Cloud API client
 * Wraps the Phala Cloud REST API for CVM management
 * 
 * API docs: https://cloud-api.phala.network/docs
 */

const BASE = 'https://cloud-api.phala.network/api/v1';

export class PhalaClient {
  constructor(apiToken) {
    if (!apiToken) throw new Error('Phala API token required');
    this.token = apiToken;
  }

  async request(method, path, body = null) {
    const url = `${BASE}${path}`;
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const text = await res.text();
    
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    
    if (!res.ok) {
      throw new Error(`Phala API ${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  // ── Auth ──
  async me() {
    return this.request('GET', '/auth/me');
  }

  // ── Teepods (available TEE nodes) ──
  async listTeepods() {
    return this.request('GET', '/teepods/available');
  }

  // ── CVM Management ──
  async listCVMs() {
    return this.request('GET', '/cvms');
  }

  async getCVM(cvmId) {
    return this.request('GET', `/cvms/${cvmId}`);
  }

  async getCVMState(cvmId) {
    return this.request('GET', `/cvms/${cvmId}/state`);
  }

  async getCVMStats(cvmId) {
    return this.request('GET', `/cvms/${cvmId}/stats`);
  }

  async getCVMNetwork(cvmId) {
    return this.request('GET', `/cvms/${cvmId}/network`);
  }

  /**
   * Provision a new CVM with a Docker Compose app
   * Returns provision data including pubkey for secret encryption
   */
  async provision(params) {
    return this.request('POST', '/cvms/provision', params);
  }

  /**
   * Create a CVM from provisioned config
   */
  async createCVM(params) {
    return this.request('POST', '/cvms', params);
  }

  async restartCVM(cvmId) {
    return this.request('POST', `/cvms/${cvmId}/restart`);
  }

  async stopCVM(cvmId) {
    return this.request('POST', `/cvms/${cvmId}/stop`);
  }

  async startCVM(cvmId) {
    return this.request('POST', `/cvms/${cvmId}/start`);
  }

  async deleteCVM(cvmId) {
    return this.request('DELETE', `/cvms/${cvmId}`);
  }

  // ── Compose / Config ──
  async getCompose(cvmId) {
    return this.request('GET', `/cvms/${cvmId}/compose_file`);
  }

  async updateEnvs(cvmId, envs) {
    return this.request('PATCH', `/cvms/${cvmId}/envs`, envs);
  }

  // ── Attestation ──
  async getAttestation(cvmId) {
    return this.request('GET', `/cvms/${cvmId}/attestation`);
  }

  async verifyQuote(quote) {
    return this.request('POST', '/attestations/verify', quote);
  }

  // ── KMS (Key Management) ──
  async listKMS() {
    return this.request('GET', '/kms');
  }

  async getAppPubkey(kmsId, appId) {
    return this.request('GET', `/kms/${kmsId}/pubkey/${appId}`);
  }

  // ── Health ──
  async health() {
    const res = await fetch('https://cloud-api.phala.network/health');
    return res.json();
  }
}
