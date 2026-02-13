# Trusted Execution Environments (TEEs) for AI Agents

*Research date: 2026-02-13*

## 1. TEE Options Available Today

### Hardware-Level TEE Technologies

| Technology | Vendor | Type | Granularity | Status |
|---|---|---|---|---|
| **Intel SGX** | Intel | Enclave (process-level) | Application | Mature, being phased out on consumer CPUs; available on Xeon |
| **Intel TDX** | Intel | VM-level | Full VM | Production on 4th/5th Gen Xeon (Sapphire/Emerald Rapids) |
| **AMD SEV-SNP** | AMD | VM-level | Full VM | Production on EPYC (Milan/Genoa/Turin) |
| **ARM TrustZone** | ARM | Secure world | System partition | Mainly embedded/mobile; not practical for server workloads |
| **ARM CCA** | ARM | Realm (VM-level) | Full VM | Emerging (ARMv9), limited cloud availability |
| **NVIDIA H100 CC** | NVIDIA | GPU TEE | GPU memory | Production; used with AMD SEV-SNP or Intel TDX hosts |

### Cloud Provider Offerings

| Provider | Product | Underlying TEE | Min Instance |
|---|---|---|---|
| **AWS Nitro Enclaves** | Nitro Enclaves on EC2 | Custom (Nitro Hypervisor) | Any Nitro-based EC2 (e.g., c5.xlarge) |
| **Azure Confidential VMs** | DCasv5 / DCadsv5 / ECasv5 series | AMD SEV-SNP | Standard_DC2as_v5 (2 vCPU, 8 GB) |
| **Azure Confidential VMs (Intel)** | DCesv5 series | Intel TDX | Standard_DC2es_v5 (2 vCPU, 16 GB) |
| **GCP Confidential VMs** | N2D / C2D / C3 Confidential | AMD SEV / SEV-SNP / Intel TDX | n2d-standard-2 (2 vCPU, 8 GB) |
| **GCP Confidential Space** | Confidential Space | AMD SEV-SNP | n2d-standard-2 |

### Decentralized / Web3 TEE Platforms

| Platform | What It Does | TEE Used |
|---|---|---|
| **Phala Network** | Confidential cloud for AI; GPU TEE with NVIDIA H100 | Intel SGX / TDX, NVIDIA CC |
| **Marlin Oyster** | Decentralized TEE compute marketplace | AWS Nitro Enclaves |
| **Oasis Network** | Confidential smart contracts + compute | Intel SGX |
| **Secret Network** | Privacy-preserving smart contracts | Intel SGX |

---

## 2. Pricing (Cheapest Usable Instances)

Prices are approximate monthly costs (on-demand, Linux, US regions) as of early 2026.

| Option | Instance | Specs | ~Monthly Cost | TEE Surcharge |
|---|---|---|---|---|
| **AWS Nitro Enclaves** | c5.xlarge | 4 vCPU, 8 GB | **~$124/mo** | **$0** (no extra charge) |
| **Azure Confidential VM** | DC2as_v5 | 2 vCPU, 8 GB | **~$110/mo** | ~10-15% over standard |
| **GCP Confidential VM** | n2d-standard-2 | 2 vCPU, 8 GB | **~$70/mo** (with committed use) | ~20-35% premium |
| **GCP Confidential VM** | n2d-standard-2 | 2 vCPU, 8 GB | **~$100/mo** (on-demand) | ~20-35% premium |
| **Phala Cloud** | Varies | CPU TEE | **From ~$50/mo** | Included |
| **Marlin Oyster** | Varies | Nitro-based | **Pay-per-use** | Market-based |

**Key takeaway:** TEE overhead costs 10-35% more than equivalent non-confidential instances. AWS Nitro Enclaves have zero surcharge (you pay only for the parent EC2 instance). The cheapest entry point for a real TEE is ~$70-110/mo.

---

## 3. Easiest Way to Spin Up a TEE (Step-by-Step)

### Option A: AWS Nitro Enclaves (Easiest for Docker users)

**Why easiest:** No code changes, Docker-based workflow, zero extra cost, well-documented.

```bash
# 1. Launch a Nitro-capable EC2 instance with enclaves enabled
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \  # Amazon Linux 2023
  --instance-type c5.xlarge \
  --enclave-options Enabled=true \
  --key-name my-key

# 2. SSH in and install the Nitro CLI
sudo amazon-linux-extras install aws-nitro-enclaves-cli
sudo yum install aws-nitro-enclaves-cli-devel -y
sudo usermod -aG ne $USER
# Allocate resources for enclave in /etc/nitro_enclaves/allocator.yaml
# memory_mib: 2048, cpu_count: 2

# 3. Start the allocator and enable it
sudo systemctl start nitro-enclaves-allocator.service
sudo systemctl enable nitro-enclaves-allocator.service

# 4. Build your Docker image as an Enclave Image File (EIF)
# Write a standard Dockerfile for your app
nitro-cli build-enclave --docker-uri my-app:latest --output-file my-app.eif

# 5. Run the enclave
nitro-cli run-enclave --eif-path my-app.eif --memory 2048 --cpu-count 2

# 6. Communicate via vsock (virtual socket) from parent instance
# Your app inside the enclave listens on vsock; parent proxies network traffic
```

**Limitations:** No direct networking from enclave (must proxy through parent). No persistent storage. No interactive SSH into enclave.

### Option B: Azure Confidential VM (Easiest "just works" option)

```bash
# 1. Create a confidential VM (feels like a normal VM)
az vm create \
  --resource-group myRG \
  --name myConfidentialVM \
  --size Standard_DC2as_v5 \
  --image Canonical:0001-com-ubuntu-confidential-vm-jammy:22_04-lts-cvm:latest \
  --security-type ConfidentialVM \
  --os-disk-security-encryption-type VMGuestStateOnly \
  --admin-username azureuser \
  --generate-ssh-keys

# 2. SSH in - it's a normal Ubuntu VM! Just with encrypted memory.
ssh azureuser@<public-ip>

# 3. Install your stuff normally
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
# ... deploy OpenClaw normally
```

**Why this is arguably easiest:** It's literally a normal VM. You SSH in, install things, run things. The TEE is transparent — AMD SEV-SNP encrypts memory at the hardware level. No code changes, no special SDKs, no vsock.

---

## 4. Trust Model — What Must the User Still Trust?

### Minimal Trust Model by TEE Type

| Component | Intel SGX | Intel TDX / AMD SEV-SNP | AWS Nitro | Azure CVM | GCP CVM |
|---|---|---|---|---|---|
| **CPU silicon** | ✅ Must trust | ✅ Must trust | ✅ Must trust | ✅ Must trust | ✅ Must trust |
| **CPU vendor (Intel/AMD)** | ✅ Must trust | ✅ Must trust | ✅ Must trust | ✅ Must trust | ✅ Must trust |
| **Cloud hypervisor** | ❌ Excluded | ❌ Excluded | ❌ Excluded | ❌ Excluded | ❌ Excluded |
| **Cloud provider (admin)** | ❌ Excluded | ❌ Excluded | ⚠️ Nitro design | ❌ Excluded | ❌ Excluded |
| **Guest OS** | ❌ Excluded (enclave) | ✅ Must trust | ✅ Must trust | ✅ Must trust | ✅ Must trust |
| **Your application code** | ✅ Must trust | ✅ Must trust | ✅ Must trust | ✅ Must trust | ✅ Must trust |
| **Attestation service** | ✅ Intel IAS/DCAP | ✅ Vendor | ✅ AWS | ✅ MAA | ✅ Google |
| **Side-channel attacks** | ⚠️ Historical vulns | ⚠️ Improving | ✅ Less exposed | ⚠️ Improving | ⚠️ Improving |

### What You Always Trust

1. **The CPU manufacturer** — Intel or AMD fabricated the chip correctly and the firmware/microcode is honest
2. **Your own code** — TEE protects from external access, not from bugs in your own code
3. **The attestation root** — Someone must verify the TEE is genuine; this chain leads to the CPU vendor

### What TEEs Remove From Trust

- ❌ Cloud provider employees / admins
- ❌ Hypervisor / host OS
- ❌ Co-tenants on same physical machine
- ❌ Physical access to the server (memory encryption defeats cold-boot attacks)

### Residual Risks

- **Side-channel attacks** — Intel SGX has had multiple side-channel vulnerabilities (Spectre, Foreshadow, etc.). AMD SEV-SNP and TDX are newer with fewer known attacks but the risk class remains.
- **Supply chain** — If the CPU is backdoored at manufacturing, all bets are off.
- **Firmware updates** — Microcode updates come from the CPU vendor and must be trusted.

---

## 5. Can OpenClaw (Node.js) Run Inside a TEE?

### Short Answer: **Yes, with the right TEE type.**

| TEE Type | Node.js Compatibility | Modifications Needed? |
|---|---|---|
| **Intel SGX (enclave)** | ❌ Very difficult | Requires porting to SGX SDK, no standard libc, no fork/exec. Node.js V8 engine won't fit in an enclave without massive rework. Gramine/Occlum LibOS can help but are fragile. |
| **Intel TDX (VM)** | ✅ Works unmodified | Full Linux VM — install Node.js normally |
| **AMD SEV-SNP (VM)** | ✅ Works unmodified | Full Linux VM — install Node.js normally |
| **AWS Nitro Enclaves** | ⚠️ Mostly works | Node.js runs in the enclave Docker container. **But:** no direct network access (must proxy via vsock), no persistent disk. Need a vsock proxy layer. |
| **Azure Confidential VM** | ✅ Works unmodified | It's a normal VM. `apt install nodejs` and go. |
| **GCP Confidential VM** | ✅ Works unmodified | It's a normal VM. `apt install nodejs` and go. |

### OpenClaw-Specific Considerations

- **Network access**: OpenClaw needs outbound HTTPS (to LLM APIs, Telegram, etc.). VM-level TEEs (Azure CVM, GCP CVM, TDX, SEV) have normal networking. Nitro Enclaves require a vsock proxy.
- **Persistent storage**: OpenClaw stores state on disk. VM-level TEEs have normal disks (encrypted). Nitro Enclaves have NO persistent storage — need to sync state to parent instance.
- **Attestation**: To prove to users that OpenClaw is running in a TEE, you'd need to expose attestation documents. This requires integration work (~100-500 lines of code) regardless of TEE type.

### Recommendation for OpenClaw

**Azure Confidential VM or GCP Confidential VM** — zero code changes, normal Linux environment, full networking, full disk. Just deploy OpenClaw as you would on any VPS.

---

## 6. Existing Projects Running AI Agents in TEEs

| Project | What It Does | TEE Used | Status |
|---|---|---|---|
| **Phala Network / Phala Cloud** | Confidential AI cloud; runs AI agents in TEE | Intel TDX, NVIDIA H100 CC | Production; 5000+ users claimed |
| **Marlin Oyster** | Decentralized TEE compute; runs arbitrary workloads in Nitro Enclaves | AWS Nitro Enclaves | Production |
| **Lit Protocol** | Decentralized key management & signing with TEE | AMD SEV-SNP | Production |
| **Fleek Network** | Decentralized edge compute with TEE | Intel SGX / TDX | Development |
| **Oasis ROFL** | Runtime Off-chain Logic in TEE for AI | Intel SGX / TDX | Production |
| **Automata Network** | Multi-prover attestation for TEE verification | Intel SGX | Production |
| **NVIDIA Confidential Computing** | GPU-accelerated AI in TEE (H100/H200) | NVIDIA CC + AMD SEV-SNP | Production |
| **Apple Private Cloud Compute** | Apple Intelligence server-side processing | Custom Apple Silicon secure enclave | Production (closed) |
| **OpenAI (rumored)** | Confidential inference for enterprise | Azure Confidential VMs | Unconfirmed |

### Web3 + TEE AI Agent Trend

A significant trend in 2024-2025 has been crypto/Web3 projects building "verifiable AI agents" — autonomous agents whose code and execution can be cryptographically attested. Key narrative: "prove your AI agent isn't lying about what model it's running or what data it has access to."

---

## 7. Comparison Matrix

| Criterion | AWS Nitro Enclaves | Azure CVM (SEV-SNP) | GCP CVM (SEV/TDX) | Intel SGX (bare metal) | Phala Cloud |
|---|---|---|---|---|---|
| **Monthly cost** | ~$124 (c5.xlarge) | ~$110 (DC2as_v5) | ~$70-100 (n2d-std-2) | $200+ (dedicated) | ~$50+ |
| **Ease of setup** | Medium (Docker+vsock) | ⭐ Very Easy (normal VM) | ⭐ Very Easy (normal VM) | Hard (SDK required) | Easy (managed) |
| **Node.js compat** | ⚠️ (no network/disk) | ✅ Full | ✅ Full | ❌ Impractical | ✅ Full |
| **Network access** | Proxy via vsock | Normal | Normal | Proxy via ocalls | Normal |
| **Persistent storage** | ❌ None | ✅ Encrypted disk | ✅ Encrypted disk | Limited | ✅ Yes |
| **Trust exclusions** | Nitro hypervisor isolates | Excludes hypervisor+admin | Excludes hypervisor+admin | Excludes everything except CPU | Excludes cloud admin |
| **Attestation** | ✅ Built-in | ✅ MAA | ✅ Google Attestation | ✅ DCAP/EPID | ✅ On-chain |
| **Performance overhead** | ~0% (same instance) | 2-5% | 2-5% (SEV), ~5% (TDX) | 5-15% (enclave transitions) | ~5% |
| **GPU TEE support** | ❌ No | ⚠️ Limited (preview) | ✅ H100 CVM | ❌ No | ✅ H100/H200 |
| **Best for** | Secrets processing | General workloads | Cost-sensitive workloads | Maximum isolation | Web3/verifiable AI |

---

## 8. Recommendations for OpenClaw in a TEE

### Quickest Path (Today)
1. **Azure Confidential VM (DC2as_v5)** — ~$110/mo, zero code changes, normal Ubuntu, attestation available
2. **GCP Confidential VM (n2d-standard-2)** — ~$70-100/mo, same ease, slightly cheaper

### If Attestation Matters (Proving to Users)
- Add an attestation endpoint to OpenClaw (~200 lines) that fetches the TEE's attestation report and serves it
- Users can verify: "this OpenClaw instance is running inside a genuine AMD SEV-SNP VM with this specific code hash"
- This is the killer feature for "trustless" AI agent operation

### If Cost Matters
- GCP n2d-standard-2 Confidential VM with committed use discount: ~$50-70/mo
- Phala Cloud for Web3-native deployment

### If Maximum Security Matters
- AWS Nitro Enclaves (smallest attack surface, but requires vsock proxy work)
- Run OpenClaw inside the enclave, proxy all network through parent instance
- Estimated integration effort: 2-3 days of engineering

### Architecture for "Trustless OpenClaw"

```
User ←→ Telegram API ←→ [TEE: OpenClaw + Attestation Service]
                              ↓
                         LLM API (encrypted TLS from within TEE)
                              ↓
                         Attestation Report (proves code integrity)
```

The user can verify:
- ✅ The exact OpenClaw code running (via attestation hash)
- ✅ Memory is encrypted (hardware guarantee)
- ✅ Cloud admin cannot read memory/state
- ❌ Cannot verify LLM provider behavior (separate trust boundary)
- ❌ Must still trust CPU vendor (Intel/AMD)

---

## 9. Open Questions for Further Research

1. **Attestation UX**: How to make attestation verification user-friendly (not just for developers)?
2. **LLM trust boundary**: TEE protects the agent, but the LLM API is external. Could run local models inside TEE (but need GPU TEE for performance).
3. **Key management**: Where do API keys live? Inside TEE is ideal, but how do they get provisioned initially? (AWS KMS + attestation-based release is one pattern)
4. **Cost optimization**: Spot/preemptible confidential VMs? (GCP supports this)
5. **ARM TEE**: As ARM servers mature (Graviton, Ampere), will ARM CCA provide cheaper TEE options?
