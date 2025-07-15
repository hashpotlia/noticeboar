class UserPortal {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.notices = [];
        this.userSignatures = [];
    }

    async init() {
        console.log('🚀 Initializing User Portal...');
        
        const isAuth = await this.checkAuthStatus();
        
        if (!isAuth) {
            console.log('❌ No valid USER session, redirecting to manager portal...');
            this.redirectToManagerPortal();
            return;
        }

        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

        await this.loadUserData();
        this.renderNotices();
        this.setupEventListeners();
        
        console.log('✅ User Portal initialized');
    }

    async checkAuthStatus() {
        try {
            // Check stored session
            let storedSession = sessionStorage.getItem('userSession') || localStorage.getItem('userSession');
            
            if (storedSession) {
                const sessionData = JSON.parse(storedSession);
                
                if (sessionData.email && sessionData.userRole === 'USER') {
                    // Use existing getUserByEmail from admin-script.js
                    const userRecord = await getUserByEmail(sessionData.email);
                    
                    if (userRecord && userRecord.isActive && userRecord.role === 'USER') {
                        this.currentUser = {
                            email: sessionData.email,
                            accessToken: sessionData.accessToken,
                            dbUser: userRecord
                        };
                        this.isAuthenticated = true;
                        this.updateUserInfo();
                        
                        // Update cognitoAuth
                        cognitoAuth.currentUser = { email: sessionData.email };
                        cognitoAuth.accessToken = sessionData.accessToken;
                        
                        sessionStorage.removeItem('userSession');
                        return true;
                    }
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('Auth check failed:', error);
            return false;
        }
    }

    redirectToManagerPortal() {
        window.location.href = 'index.html';
    }

    updateUserInfo() {
        if (this.currentUser?.dbUser) {
            document.getElementById('user-name').textContent = this.currentUser.dbUser.name;
            document.getElementById('user-email').textContent = this.currentUser.dbUser.email;
        }
    }

    async loadUserData() {
        try {
            console.log('📊 Loading user data...');
            
            // Use existing functions from admin-script.js
            const [notices, signatures] = await Promise.all([
                fetchAllNotices(),
                this.fetchUserSignatures(this.currentUser.dbUser.id)
            ]);
            
            this.notices = notices.filter(notice => notice.isActive);
            this.userSignatures = signatures;
            
            console.log('✅ User data loaded:', {
                notices: this.notices.length,
                signatures: this.userSignatures.length
            });
            
        } catch (error) {
            console.error('Failed to load user data:', error);
            this.notices = [];
            this.userSignatures = [];
        }
    }

    async fetchUserSignatures(userId) {
        // Use the same pattern as admin-script.js
        const query = `
            query GetUserSignatures($userId: ID!) {
                listSignatures(filter: {userId: {eq: $userId}}) {
                    items {
                        id
                        noticeId
                        userId
                        userName
                        userEmail
                        signedAt
                        createdAt
                        updatedAt
                    }
                }
            }
        `;
        
        const data = await graphqlRequest(query, { userId });
        return data.listSignatures.items;
    }

    async createSignature(signatureData) {
        const mutation = `
            mutation CreateSignature($input: CreateSignatureInput!) {
                createSignature(input: $input) {
                    id
                    noticeId
                    userId
                    userName
                    userEmail
                    signedAt
                }
            }
        `;

        const uniqueId = 'sig-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        const variables = {
            input: {
                id: uniqueId,
                noticeId: signatureData.noticeId,
                noticeID: signatureData.noticeId,
                userId: signatureData.userId,
                userName: signatureData.userName,
                userEmail: signatureData.userEmail,
                signedAt: signatureData.signedAt
            }
        };

        const data = await graphqlRequest(mutation, variables);
        return data.createSignature;
    }

    renderNotices() {
        const container = document.getElementById('notices-container');
        
        if (this.notices.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">📭</div>
                    <h3 class="text-xl font-semibold mb-2">No Active Notices</h3>
                    <p class="text-slate-400">There are no notices to display at this time.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.notices.map(notice => {
            const userSignature = this.userSignatures.find(sig => sig.noticeId === notice.id);
            const isAcknowledged = !!userSignature;
            
            return `
                <div class="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                    <div class="p-6">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h3 class="text-xl font-semibold text-white mb-2">${notice.title}</h3>
                                <div class="flex items-center space-x-4 text-sm text-slate-400">
                                    <span>📅 ${this.formatDate(notice.createdAt)}</span>
                                    <span>👤 ${notice.author}</span>
                                    ${notice.department !== 'All' ? `<span>🏢 ${notice.department}</span>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center space-x-2">
                                ${isAcknowledged ? 
                                    '<span class="status-active">✅ Acknowledged</span>' : 
                                    '<span class="status-pending">⏳ Pending</span>'
                                }
                            </div>
                        </div>
                        
                        <div class="prose prose-invert max-w-none mb-6">
                            ${notice.content}
                        </div>
                        
                        ${isAcknowledged ? `
                            <div class="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center space-x-2">
                                        <span class="text-green-400">✅</span>
                                        <span class="text-green-200">You acknowledged this notice</span>
                                    </div>
                                    <span class="text-sm text-green-300">
                                        ${this.formatDate(userSignature.signedAt)}
                                    </span>
                                </div>
                            </div>
                        ` : `
                            <div class="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center space-x-2">
                                        <span class="text-amber-400">⚠️</span>
                                        <span class="text-amber-200">Acknowledgment Required</span>
                                    </div>
                                    <button onclick="userPortal.acknowledgeNotice('${notice.id}')" 
                                            class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors">
                                        ✍️ Acknowledge
                                    </button>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    async acknowledgeNotice(noticeId) {
        if (!this.isAuthenticated) {
            this.redirectToManagerPortal();
            return;
        }

        try {
            const signature = await this.createSignature({
                noticeId: noticeId,
                userId: this.currentUser.dbUser.id,
                userName: this.currentUser.dbUser.name,
                userEmail: this.currentUser.dbUser.email,
                signedAt: new Date().toISOString()
            });

            this.userSignatures.push(signature);
            this.renderNotices();
            this.showToast('Notice acknowledged successfully!', 'success');
            
        } catch (error) {
            console.error('Failed to acknowledge notice:', error);
            this.showToast('Failed to acknowledge notice. Please try again.', 'error');
        }
    }

    setupEventListeners() {
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
    }

    async logout() {
        sessionStorage.removeItem('userSession');
        localStorage.removeItem('userSession');
        
        if (cognitoAuth.signOut) {
            await cognitoAuth.signOut();
        }
        
        cognitoAuth.currentUser = null;
        cognitoAuth.accessToken = null;
        
        window.location.href = 'index.html';
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg text-white z-50 ${
            type === 'success' ? 'bg-green-600' : 
            type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// Initialize
const userPortal = new UserPortal();
document.addEventListener('DOMContentLoaded', () => {
    userPortal.init();
});
