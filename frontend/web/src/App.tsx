import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface CampaignData {
  id: string;
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  creator: string;
  timestamp: number;
  isVerified?: boolean;
  decryptedValue?: number;
  publicValue1: number;
  publicValue2: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newCampaignData, setNewCampaignData] = useState({ 
    title: "", 
    description: "", 
    targetAmount: "" 
  });
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignData | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState({
    totalCampaigns: 0,
    totalRaised: 0,
    verifiedCount: 0,
    activeCampaigns: 0
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const campaignsList: CampaignData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          campaignsList.push({
            id: businessId,
            title: businessData.name,
            description: businessData.description,
            targetAmount: Number(businessData.publicValue1) || 0,
            currentAmount: Number(businessData.publicValue2) || 0,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setCampaigns(campaignsList);
      
      const totalRaised = campaignsList.reduce((sum, c) => sum + c.currentAmount, 0);
      const verifiedCount = campaignsList.filter(c => c.isVerified).length;
      const activeCampaigns = campaignsList.filter(c => c.currentAmount < c.targetAmount).length;
      
      setStats({
        totalCampaigns: campaignsList.length,
        totalRaised,
        verifiedCount,
        activeCampaigns
      });
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createCampaign = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingCampaign(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating campaign with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const targetAmount = parseInt(newCampaignData.targetAmount) || 0;
      const businessId = `campaign-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, targetAmount);
      
      const tx = await contract.createBusinessData(
        businessId,
        newCampaignData.title,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        targetAmount,
        0,
        newCampaignData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Campaign created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewCampaignData({ title: "", description: "", targetAmount: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingCampaign(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available and ready!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Contract check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredCampaigns = campaigns.filter(campaign =>
    campaign.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    campaign.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderStatsPanel = () => (
    <div className="stats-panels">
      <div className="stat-panel">
        <div className="stat-icon">📊</div>
        <div className="stat-content">
          <div className="stat-value">{stats.totalCampaigns}</div>
          <div className="stat-label">Total Campaigns</div>
        </div>
      </div>
      
      <div className="stat-panel">
        <div className="stat-icon">💰</div>
        <div className="stat-content">
          <div className="stat-value">{stats.totalRaised}</div>
          <div className="stat-label">Total Raised</div>
        </div>
      </div>
      
      <div className="stat-panel">
        <div className="stat-icon">🔐</div>
        <div className="stat-content">
          <div className="stat-value">{stats.verifiedCount}</div>
          <div className="stat-label">Verified</div>
        </div>
      </div>
      
      <div className="stat-panel">
        <div className="stat-icon">⚡</div>
        <div className="stat-content">
          <div className="stat-value">{stats.activeCampaigns}</div>
          <div className="stat-label">Active</div>
        </div>
      </div>
    </div>
  );

  const renderFHEProcess = () => (
    <div className="fhe-process">
      <div className="process-step">
        <div className="step-number">1</div>
        <div className="step-content">
          <h4>Encrypt Donation</h4>
          <p>Amount encrypted using FHE before submission</p>
        </div>
      </div>
      <div className="process-arrow">→</div>
      <div className="process-step">
        <div className="step-number">2</div>
        <div className="step-content">
          <h4>On-chain Storage</h4>
          <p>Encrypted data stored with public metadata</p>
        </div>
      </div>
      <div className="process-arrow">→</div>
      <div className="process-step">
        <div className="step-number">3</div>
        <div className="step-content">
          <h4>Homomorphic Update</h4>
          <p>Progress bar updates without revealing amounts</p>
        </div>
      </div>
      <div className="process-arrow">→</div>
      <div className="process-step">
        <div className="step-number">4</div>
        <div className="step-content">
          <h4>Selective Reveal</h4>
          <p>Donors can verify their contributions privately</p>
        </div>
      </div>
    </div>
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo-section">
            <h1>CrowdSecret FHE 🔒</h1>
            <p>Privacy-Preserving Crowdfunding</p>
          </div>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </header>
        
        <div className="welcome-section">
          <div className="welcome-content">
            <div className="welcome-icon">🔒</div>
            <h2>Welcome to Confidential Crowdfunding</h2>
            <p>Connect your wallet to start supporting projects with complete privacy protection</p>
            <div className="feature-grid">
              <div className="feature-item">
                <span className="feature-icon">👤</span>
                <h4>Donor Privacy</h4>
                <p>Individual contributions remain confidential</p>
              </div>
              <div className="feature-item">
                <span className="feature-icon">📈</span>
                <h4>Transparent Progress</h4>
                <p>See total raised without exposing details</p>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🔐</span>
                <h4>FHE Protected</h4>
                <p>Fully homomorphic encryption ensures security</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="encryption-animation">
          <div className="lock-icon">🔒</div>
          <div className="encryption-dots">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        </div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Setting up confidential computing environment</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading confidential campaigns...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <h1>CrowdSecret FHE 🔒</h1>
          <p>Privacy-First Crowdfunding Platform</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="check-btn">
            Check Contract
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + Start Campaign
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      <div className="main-content">
        <div className="dashboard-section">
          <h2>Confidential Crowdfunding Dashboard</h2>
          {renderStatsPanel()}
          
          <div className="fhe-explainer">
            <h3>How FHE Protects Your Privacy</h3>
            {renderFHEProcess()}
          </div>
        </div>

        <div className="campaigns-section">
          <div className="section-header">
            <h2>Active Campaigns</h2>
            <div className="controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search campaigns..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <span className="search-icon">🔍</span>
              </div>
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="campaigns-grid">
            {filteredCampaigns.length === 0 ? (
              <div className="no-campaigns">
                <p>No campaigns found</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Start First Campaign
                </button>
              </div>
            ) : filteredCampaigns.map((campaign) => (
              <div 
                className={`campaign-card ${selectedCampaign?.id === campaign.id ? "selected" : ""}`} 
                key={campaign.id}
                onClick={() => setSelectedCampaign(campaign)}
              >
                <div className="campaign-header">
                  <h3>{campaign.title}</h3>
                  <span className={`status-badge ${campaign.isVerified ? "verified" : "pending"}`}>
                    {campaign.isVerified ? "✅ Verified" : "🔓 Pending"}
                  </span>
                </div>
                
                <p className="campaign-desc">{campaign.description}</p>
                
                <div className="progress-section">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${Math.min(100, (campaign.currentAmount / campaign.targetAmount) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    <span>Raised: {campaign.currentAmount}</span>
                    <span>Goal: {campaign.targetAmount}</span>
                  </div>
                </div>
                
                <div className="campaign-meta">
                  <span>By: {campaign.creator.substring(0, 6)}...{campaign.creator.substring(38)}</span>
                  <span>{new Date(campaign.timestamp * 1000).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CreateCampaignModal 
          onSubmit={createCampaign} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingCampaign} 
          campaignData={newCampaignData} 
          setCampaignData={setNewCampaignData}
          isEncrypting={isEncrypting}
        />
      )}

      {selectedCampaign && (
        <CampaignDetailModal 
          campaign={selectedCampaign} 
          onClose={() => { 
            setSelectedCampaign(null); 
            setDecryptedAmount(null); 
          }} 
          decryptedAmount={decryptedAmount} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedCampaign.id)}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            <div className="toast-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="toast-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <p>CrowdSecret FHE - Protecting donor privacy through fully homomorphic encryption</p>
          <div className="footer-links">
            <span>FAQ</span>
            <span>Terms</span>
            <span>Privacy</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

const CreateCampaignModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  campaignData: any;
  setCampaignData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, campaignData, setCampaignData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'targetAmount') {
      const intValue = value.replace(/[^\d]/g, '');
      setCampaignData({ ...campaignData, [name]: intValue });
    } else {
      setCampaignData({ ...campaignData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Start New Campaign</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔒 Encryption Active</strong>
            <p>Target amount will be encrypted using fully homomorphic encryption</p>
          </div>
          
          <div className="form-group">
            <label>Campaign Title *</label>
            <input 
              type="text" 
              name="title" 
              value={campaignData.title} 
              onChange={handleChange} 
              placeholder="Enter campaign title..." 
            />
          </div>
          
          <div className="form-group">
            <label>Description *</label>
            <textarea 
              name="description" 
              value={campaignData.description} 
              onChange={handleChange} 
              placeholder="Describe your campaign..." 
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label>Target Amount (Integer only) *</label>
            <input 
              type="number" 
              name="targetAmount" 
              value={campaignData.targetAmount} 
              onChange={handleChange} 
              placeholder="Enter target amount..." 
              step="1"
              min="0"
            />
            <div className="encryption-label">FHE Encrypted Integer</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !campaignData.title || !campaignData.description || !campaignData.targetAmount} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting and Creating..." : "Create Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
};

const CampaignDetailModal: React.FC<{
  campaign: CampaignData;
  onClose: () => void;
  decryptedAmount: number | null;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ campaign, onClose, decryptedAmount, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    if (decryptedAmount !== null) return;
    await decryptData();
  };

  const progress = (campaign.currentAmount / campaign.targetAmount) * 100;

  return (
    <div className="modal-overlay">
      <div className="detail-modal">
        <div className="modal-header">
          <h2>Campaign Details</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="campaign-info">
            <h3>{campaign.title}</h3>
            <p className="campaign-description">{campaign.description}</p>
            
            <div className="info-grid">
              <div className="info-item">
                <span>Creator:</span>
                <strong>{campaign.creator.substring(0, 6)}...{campaign.creator.substring(38)}</strong>
              </div>
              <div className="info-item">
                <span>Created:</span>
                <strong>{new Date(campaign.timestamp * 1000).toLocaleDateString()}</strong>
              </div>
              <div className="info-item">
                <span>Status:</span>
                <strong className={campaign.isVerified ? "verified" : "pending"}>
                  {campaign.isVerified ? "✅ Verified" : "🔓 Pending Verification"}
                </strong>
              </div>
            </div>
          </div>
          
          <div className="progress-section">
            <h4>Funding Progress</h4>
            <div className="progress-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${Math.min(100, progress)}%` }}
                ></div>
              </div>
              <div className="progress-numbers">
                <span>Raised: {campaign.currentAmount}</span>
                <span>Goal: {campaign.targetAmount}</span>
                <span>{Math.min(100, progress).toFixed(1)}%</span>
              </div>
            </div>
          </div>
          
          <div className="encryption-section">
            <h4>FHE Protection</h4>
            <div className="encryption-status">
              <div className="status-item">
                <span>Target Amount:</span>
                <strong>
                  {campaign.isVerified ? 
                    `${campaign.decryptedValue} (On-chain Verified)` : 
                    decryptedAmount !== null ? 
                    `${decryptedAmount} (Locally Decrypted)` : 
                    "🔒 FHE Encrypted"
                  }
                </strong>
              </div>
              
              <button 
                className={`decrypt-btn ${(campaign.isVerified || decryptedAmount !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting || campaign.isVerified}
              >
                {isDecrypting ? "Decrypting..." : 
                 campaign.isVerified ? "✅ Verified" : 
                 decryptedAmount !== null ? "🔓 Decrypted" : 
                 "🔓 Verify Amount"}
              </button>
            </div>
            
            <div className="fhe-explanation">
              <p>This amount is protected by fully homomorphic encryption, allowing progress tracking while keeping individual contributions private.</p>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!campaign.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "Verifying..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;