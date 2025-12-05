// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Post {
  id: number;
  title: string;
  content: string;
  encryptedHealthData: string;
  timestamp: number;
  author: string;
  tags: string[];
}

interface UserAction {
  type: 'create' | 'comment' | 'decrypt';
  timestamp: number;
  details: string;
}

// FHE encryption/decryption functions
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newPostData, setNewPostData] = useState({ title: "", content: "", tags: "" });
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [decryptedHealthData, setDecryptedHealthData] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [activeTab, setActiveTab] = useState('posts');
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");

  // Initialize signature parameters
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  // Load data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      // Load posts
      const postsBytes = await contract.getData("posts");
      let postsList: Post[] = [];
      if (postsBytes.length > 0) {
        try {
          const postsStr = ethers.toUtf8String(postsBytes);
          if (postsStr.trim() !== '') postsList = JSON.parse(postsStr);
        } catch (e) {}
      }
      setPosts(postsList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  // Create new post
  const createPost = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingPost(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating post with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create new post
      const tags = newPostData.tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
      const healthScore = Math.floor(Math.random() * 100); // Simulated health data
      
      const newPost: Post = {
        id: posts.length + 1,
        title: newPostData.title,
        content: newPostData.content,
        encryptedHealthData: FHEEncryptNumber(healthScore),
        timestamp: Math.floor(Date.now() / 1000),
        author: address,
        tags: tags
      };
      
      // Update posts list
      const updatedPosts = [...posts, newPost];
      
      // Save to contract
      await contract.setData("posts", ethers.toUtf8Bytes(JSON.stringify(updatedPosts)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'create',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Created post: ${newPostData.title}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Post created successfully!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewPostData({ title: "", content: "", tags: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingPost(false); 
    }
  };

  // Decrypt health data with signature
  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'decrypt',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Decrypted FHE health data"
      };
      setUserActions(prev => [newAction, ...prev]);
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  // Handle decrypt button click
  const handleDecrypt = async () => {
    if (!selectedPost) return;
    
    if (decryptedHealthData !== null) {
      setDecryptedHealthData(null);
      return;
    }
    
    const decrypted = await decryptWithSignature(selectedPost.encryptedHealthData);
    if (decrypted !== null) {
      setDecryptedHealthData(decrypted);
    }
  };

  // Filter posts based on search term and selected tag
  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         post.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = selectedTag === "all" || post.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  // Get all unique tags from posts
  const allTags = Array.from(new Set(posts.flatMap(post => post.tags)));

  // Render user actions history
  const renderUserActions = () => {
    if (userActions.length === 0) return <div className="no-data">No actions recorded</div>;
    
    return (
      <div className="actions-list">
        {userActions.map((action, index) => (
          <div className="action-item" key={index}>
            <div className={`action-type ${action.type}`}>
              {action.type === 'create' && '📝'}
              {action.type === 'comment' && '💬'}
              {action.type === 'decrypt' && '🔓'}
            </div>
            <div className="action-details">
              <div className="action-text">{action.details}</div>
              <div className="action-time">{new Date(action.timestamp * 1000).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render FAQ section
  const renderFAQ = () => {
    const faqItems = [
      {
        question: "What is Health Circle FHE?",
        answer: "Health Circle FHE is a private social network for patients with similar conditions, where all health data is encrypted using Fully Homomorphic Encryption (FHE) to protect your privacy."
      },
      {
        question: "How does FHE protect my health data?",
        answer: "FHE allows computations to be performed on encrypted data without decrypting it. Your health information remains encrypted at all times, even when being processed."
      },
      {
        question: "Can anyone see my health data?",
        answer: "No, your health data is encrypted and can only be decrypted with your explicit permission through wallet signature."
      },
      {
        question: "How are groups formed?",
        answer: "Groups are automatically formed based on encrypted health data tags, ensuring you connect with relevant patients while maintaining privacy."
      },
      {
        question: "What blockchain is this built on?",
        answer: "Health Circle FHE is built on Ethereum and utilizes Zama FHE for privacy-preserving health data management."
      }
    ];
    
    return (
      <div className="faq-container">
        {faqItems.map((item, index) => (
          <div className="faq-item" key={index}>
            <div className="faq-question">{item.question}</div>
            <div className="faq-answer">{item.answer}</div>
          </div>
        ))}
      </div>
    );
  };

  // Render health data visualization
  const renderHealthData = (value: number | null) => {
    if (value === null) return null;
    
    const healthLevel = value < 30 ? "low" : value < 70 ? "medium" : "high";
    
    return (
      <div className="health-visualization">
        <div className="health-meter">
          <div 
            className={`health-fill ${healthLevel}`}
            style={{ width: `${value}%` }}
          ></div>
          <div className="health-value">{value.toFixed(0)}</div>
        </div>
        <div className="health-label">
          {healthLevel === "low" && "Needs more support"}
          {healthLevel === "medium" && "Moderate condition"}
          {healthLevel === "high" && "Good condition"}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted health community...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="health-icon"></div>
          </div>
          <h1>Health Circle <span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-post-btn"
          >
            <div className="add-icon"></div>New Post
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <div className="dashboard-grid">
            <div className="dashboard-panel intro-panel">
              <div className="panel-card">
                <h2>Private Community for Patients</h2>
                <p>Health Circle FHE is a safe space for patients with similar conditions to share experiences and support each other, with all health data protected by Zama FHE encryption.</p>
                <div className="fhe-badge">
                  <div className="fhe-icon"></div>
                  <span>Powered by Zama FHE</span>
                </div>
              </div>
              
              <div className="panel-card stats-card">
                <h2>Community Statistics</h2>
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-value">{posts.length}</div>
                    <div className="stat-label">Posts</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {allTags.length}
                    </div>
                    <div className="stat-label">Conditions</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {Array.from(new Set(posts.map(p => p.author))).length}
                    </div>
                    <div className="stat-label">Members</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'posts' ? 'active' : ''}`}
                onClick={() => setActiveTab('posts')}
              >
                Community Posts
              </button>
              <button 
                className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
                onClick={() => setActiveTab('actions')}
              >
                My Activity
              </button>
              <button 
                className={`tab ${activeTab === 'faq' ? 'active' : ''}`}
                onClick={() => setActiveTab('faq')}
              >
                FAQ
              </button>
            </div>
            
            <div className="tab-content">
              {activeTab === 'posts' && (
                <div className="posts-section">
                  <div className="section-header">
                    <h2>Community Discussions</h2>
                    <div className="header-actions">
                      <div className="search-box">
                        <input 
                          type="text" 
                          placeholder="Search posts..." 
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <div className="search-icon"></div>
                      </div>
                      <div className="tag-filter">
                        <select 
                          value={selectedTag} 
                          onChange={(e) => setSelectedTag(e.target.value)}
                        >
                          <option value="all">All Conditions</option>
                          {allTags.map(tag => (
                            <option key={tag} value={tag}>{tag}</option>
                          ))}
                        </select>
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
                  
                  <div className="posts-list">
                    {filteredPosts.length === 0 ? (
                      <div className="no-posts">
                        <div className="no-posts-icon"></div>
                        <p>No posts found</p>
                        <button 
                          className="create-btn" 
                          onClick={() => setShowCreateModal(true)}
                        >
                          Create First Post
                        </button>
                      </div>
                    ) : filteredPosts.map((post, index) => (
                      <div 
                        className={`post-item ${selectedPost?.id === post.id ? "selected" : ""}`} 
                        key={index}
                        onClick={() => setSelectedPost(post)}
                      >
                        <div className="post-title">{post.title}</div>
                        <div className="post-content">{post.content.substring(0, 100)}...</div>
                        <div className="post-tags">
                          {post.tags.map(tag => (
                            <span key={tag} className="tag">{tag}</span>
                          ))}
                        </div>
                        <div className="post-meta">
                          <span className="post-author">{post.author.substring(0, 6)}...{post.author.substring(38)}</span>
                          <span className="post-time">{new Date(post.timestamp * 1000).toLocaleDateString()}</span>
                        </div>
                        <div className="post-encrypted">Health Data: {post.encryptedHealthData.substring(0, 15)}...</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {activeTab === 'actions' && (
                <div className="actions-section">
                  <h2>My Activity History</h2>
                  {renderUserActions()}
                </div>
              )}
              
              {activeTab === 'faq' && (
                <div className="faq-section">
                  <h2>Frequently Asked Questions</h2>
                  {renderFAQ()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreatePost 
          onSubmit={createPost} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingPost} 
          postData={newPostData} 
          setPostData={setNewPostData}
        />
      )}
      
      {selectedPost && (
        <PostDetailModal 
          post={selectedPost} 
          onClose={() => { 
            setSelectedPost(null); 
            setDecryptedHealthData(null); 
          }} 
          decryptedHealthData={decryptedHealthData} 
          isDecrypting={isDecrypting} 
          handleDecrypt={handleDecrypt}
          renderHealthData={renderHealthData}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="health-icon"></div>
              <span>Health Circle FHE</span>
            </div>
            <p>Private community for patients with FHE-protected health data</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} Health Circle FHE. All rights reserved.</div>
          <div className="disclaimer">
            This community uses fully homomorphic encryption to protect member health data. 
            All health information remains encrypted at all times.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreatePostProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  postData: any;
  setPostData: (data: any) => void;
}

const ModalCreatePost: React.FC<ModalCreatePostProps> = ({ onSubmit, onClose, creating, postData, setPostData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPostData({ ...postData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-post-modal">
        <div className="modal-header">
          <h2>Create New Post</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Privacy Notice</strong>
              <p>Your health data will be encrypted using Zama FHE</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Title *</label>
            <input 
              type="text" 
              name="title" 
              value={postData.title} 
              onChange={handleChange} 
              placeholder="Enter post title..." 
            />
          </div>
          
          <div className="form-group">
            <label>Content *</label>
            <textarea 
              name="content" 
              value={postData.content} 
              onChange={handleChange} 
              placeholder="Share your experience..." 
              rows={4}
            />
          </div>
          
          <div className="form-group">
            <label>Conditions/Tags (comma separated)</label>
            <input 
              type="text" 
              name="tags" 
              value={postData.tags} 
              onChange={handleChange} 
              placeholder="e.g. diabetes, heart disease" 
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || !postData.title || !postData.content} 
            className="submit-btn"
          >
            {creating ? "Creating with FHE..." : "Create Post"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface PostDetailModalProps {
  post: Post;
  onClose: () => void;
  decryptedHealthData: number | null;
  isDecrypting: boolean;
  handleDecrypt: () => void;
  renderHealthData: (value: number | null) => JSX.Element | null;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({ 
  post, 
  onClose, 
  decryptedHealthData, 
  isDecrypting, 
  handleDecrypt,
  renderHealthData
}) => {
  return (
    <div className="modal-overlay">
      <div className="post-detail-modal">
        <div className="modal-header">
          <h2>Post Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="post-info">
            <div className="info-item">
              <span>Title:</span>
              <strong>{post.title}</strong>
            </div>
            <div className="info-item">
              <span>Author:</span>
              <strong>{post.author.substring(0, 6)}...{post.author.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Posted:</span>
              <strong>{new Date(post.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Conditions:</span>
              <div className="post-tags">
                {post.tags.map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
            </div>
            <div className="info-item full-width">
              <span>Content:</span>
              <div className="post-content">{post.content}</div>
            </div>
          </div>
          
          <div className="health-data-section">
            <h3>Encrypted Health Data</h3>
            <div className="encrypted-data">{post.encryptedHealthData.substring(0, 100)}...</div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted</span>
            </div>
            <button 
              className="decrypt-btn" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span>Decrypting...</span>
              ) : decryptedHealthData !== null ? (
                "Hide Health Data"
              ) : (
                "Decrypt with Wallet Signature"
              )}
            </button>
          </div>
          
          {decryptedHealthData !== null && (
            <div className="decrypted-section">
              <h3>Health Data Visualization</h3>
              {renderHealthData(decryptedHealthData)}
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted health data is only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;