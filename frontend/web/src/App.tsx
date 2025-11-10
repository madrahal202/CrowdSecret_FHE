import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface CrowdfundingProject {
  id: string;
  name: string;
  encryptedAmount: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
  category: string;
  targetAmount: number;
  currentAmount: number;
  backersCount: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<CrowdfundingProject[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState({ 
    visible: false, 
    status: "pending" as "pending" | "success" | "error", 
    message: "" 
  });
  const [newProjectData, setNewProjectData] = useState({ 
    name: "", 
    targetAmount: "", 
    description: "",
    category: "DeFi"
  });
  const [selectedProject, setSelectedProject] = useState<CrowdfundingProject | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const projectsPerPage = 6;
  const [contributions, setContributions] = useState<{address: string, amount: number}[]>([]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevm = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        console.error('FHEVM init failed:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM初始化失败" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevm();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadData = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        const contract = await getContractReadOnly();
        if (!contract) return;
        
        setContractAddress(await contract.getAddress());
        const businessIds = await contract.getAllBusinessIds();
        const projectsList: CrowdfundingProject[] = [];
        
        for (const businessId of businessIds) {
          try {
            const businessData = await contract.getBusinessData(businessId);
            projectsList.push({
              id: businessId,
              name: businessData.name,
              encryptedAmount: businessId,
              publicValue1: Number(businessData.publicValue1) || 0,
              publicValue2: Number(businessData.publicValue2) || 0,
              description: businessData.description,
              creator: businessData.creator,
              timestamp: Number(businessData.timestamp),
              isVerified: businessData.isVerified,
              decryptedValue: Number(businessData.decryptedValue) || 0,
              category: "DeFi",
              targetAmount: 10000,
              currentAmount: Number(businessData.publicValue1) * 1000 || 5000,
              backersCount: Number(businessData.publicValue2) || 25
            });
          } catch (e) {
            console.error('Error loading project:', e);
          }
        }
        
        setProjects(projectsList);
        generateContributions();
      } catch (e) {
        console.error('Load data error:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isConnected]);

  const generateContributions = () => {
    const mockContributions = [
      { address: "0x742d...1a3b", amount: 2500 },
      { address: "0x8f3a...9c2d", amount: 1500 },
      { address: "0x3b8c...7e1f", amount: 3000 },
      { address: "0x1a9d...4f6a", amount: 1200 },
      { address: "0x6c2e...8b5d", amount: 1800 }
    ];
    setContributions(mockContributions);
  };

  const createProject = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingProject(true);
    setTransactionStatus({ visible: true, status: "pending", message: "使用Zama FHE创建加密众筹项目..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("合约连接失败");
      
      const targetAmount = parseInt(newProjectData.targetAmount) || 0;
      const businessId = `project-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, targetAmount);
      
      const tx = await contract.createBusinessData(
        businessId,
        newProjectData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        Math.floor(Math.random() * 10000),
        Math.floor(Math.random() * 100),
        newProjectData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "众筹项目创建成功!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      window.location.reload();
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected") 
        ? "用户取消交易" 
        : "创建失败: " + (e.message || "未知错误");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingProject(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
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
        setTransactionStatus({ visible: true, status: "success", message: "数据已在链上验证" });
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
      
      setTransactionStatus({ visible: true, status: "pending", message: "链上验证解密中..." });
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      setTransactionStatus({ visible: true, status: "success", message: "数据解密验证成功!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "数据已在链上验证" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "解密失败: " + (e.message || "未知错误") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const indexOfLastProject = currentPage * projectsPerPage;
  const indexOfFirstProject = indexOfLastProject - projectsPerPage;
  const currentProjects = filteredProjects.slice(indexOfFirstProject, indexOfLastProject);
  const totalPages = Math.ceil(filteredProjects.length / projectsPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const totalRaised = projects.reduce((sum, project) => sum + project.currentAmount, 0);
  const totalBackers = projects.reduce((sum, project) => sum + project.backersCount, 0);
  const successRate = projects.length > 0 ? (projects.filter(p => p.currentAmount >= p.targetAmount).length / projects.length) * 100 : 0;

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Confidential Crowdfunding 🔐</h1>
            <p>FHE加密隐私众筹平台</p>
          </div>
          <ConnectButton />
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>连接钱包开始隐私众筹</h2>
            <p>使用Zama FHE技术保护您的捐赠隐私，单笔金额完全加密</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>初始化FHE加密系统...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Confidential Crowdfunding 🔐</h1>
          <p>FHE加密隐私众筹平台</p>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + 创建项目
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      <div className="stats-dashboard">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-info">
            <h3>总募集金额</h3>
            <div className="stat-value">${totalRaised.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <h3>总支持者</h3>
            <div className="stat-value">{totalBackers}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-info">
            <h3>成功率</h3>
            <div className="stat-value">{successRate.toFixed(1)}%</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔐</div>
          <div className="stat-info">
            <h3>FHE保护</h3>
            <div className="stat-value">{projects.filter(p => p.isVerified).length}/{projects.length}</div>
          </div>
        </div>
      </div>

      <div className="contributions-board">
        <h3>实时贡献榜</h3>
        <div className="contributions-list">
          {contributions.map((contribution, index) => (
            <div key={index} className="contribution-item">
              <span className="contributor-address">{contribution.address}</span>
              <span className="contribution-amount">${contribution.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="projects-section">
        <div className="section-header">
          <h2>进行中项目</h2>
          <div className="search-box">
            <input
              type="text"
              placeholder="搜索项目..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="projects-grid">
          {currentProjects.map((project) => (
            <div key={project.id} className="project-card">
              <div className="project-header">
                <h3>{project.name}</h3>
                <span className={`status ${project.currentAmount >= project.targetAmount ? 'success' : 'funding'}`}>
                  {project.currentAmount >= project.targetAmount ? '成功' : '募集中'}
                </span>
              </div>
              
              <div className="project-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${Math.min(100, (project.currentAmount / project.targetAmount) * 100)}%` }}
                  ></div>
                </div>
                <div className="progress-info">
                  <span>${project.currentAmount.toLocaleString()}</span>
                  <span>目标: ${project.targetAmount.toLocaleString()}</span>
                </div>
              </div>

              <p className="project-description">{project.description}</p>
              
              <div className="project-stats">
                <span>👥 {project.backersCount} 支持者</span>
                <span>🔐 {project.isVerified ? '已验证' : '待解密'}</span>
              </div>

              <button 
                onClick={() => decryptData(project.id)}
                className={`decrypt-btn ${project.isVerified ? 'verified' : ''}`}
                disabled={isDecrypting}
              >
                {isDecrypting ? '解密中...' : project.isVerified ? '✅ 已验证' : '🔓 验证金额'}
              </button>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(number => (
              <button
                key={number}
                onClick={() => paginate(number)}
                className={`page-btn ${currentPage === number ? 'active' : ''}`}
              >
                {number}
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>创建新众筹项目</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>项目名称</label>
                <input
                  type="text"
                  value={newProjectData.name}
                  onChange={(e) => setNewProjectData({...newProjectData, name: e.target.value})}
                  placeholder="输入项目名称"
                />
              </div>
              
              <div className="form-group">
                <label>目标金额 (FHE加密)</label>
                <input
                  type="number"
                  value={newProjectData.targetAmount}
                  onChange={(e) => setNewProjectData({...newProjectData, targetAmount: e.target.value})}
                  placeholder="输入目标金额"
                />
              </div>
              
              <div className="form-group">
                <label>项目描述</label>
                <textarea
                  value={newProjectData.description}
                  onChange={(e) => setNewProjectData({...newProjectData, description: e.target.value})}
                  placeholder="描述您的项目"
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">取消</button>
              <button 
                onClick={createProject}
                disabled={creatingProject || !newProjectData.name || !newProjectData.targetAmount}
                className="create-submit-btn"
              >
                {creatingProject ? '创建中...' : '创建项目'}
              </button>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          {transactionStatus.message}
        </div>
      )}
    </div>
  );
};

export default App;

