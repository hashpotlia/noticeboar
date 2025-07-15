// AWS Backend Integration - ADD THIS AT THE TOP
const GRAPHQL_ENDPOINT = 'https://3gaukjf6ezdkdl3eisa4ufpka4.appsync-api.us-east-1.amazonaws.com/graphql';
const API_KEY = 'da2-ewcwzm2sw5fxlen46lmrzipz7m';

// GraphQL API Helper Function
async function graphqlRequest(query, variables = {}) {
    try {
        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                query,
                variables
            })
        });
        
        const result = await response.json();
        if (result.errors) {
            console.error('GraphQL Errors:', result.errors);
            throw new Error(result.errors[0].message);
        }
        return result.data;
    } catch (error) {
        console.error('API Request failed:', error);
        throw error;
    }
}

// Fetch Real Notices from Database
async function fetchNoticesFromDB() {
    const query = `
        query ListNotices {
            listNotices {
                items {
                    id
                    title
                    content
                    category
                    priority
                    author
                    source
                    isPinned
                    requiresSignature
                    createdAt
                    expiresAt
                    tags
                }
            }
        }
    `;
    
    try {
        const data = await graphqlRequest(query);
        return data.listNotices.items;
    } catch (error) {
        console.error('Failed to fetch notices:', error);
        return [];
    }
}

// Fetch Signatures from Database
async function fetchSignaturesFromDB() {
    const query = `
        query ListSignatures {
            listSignatures {
                items {
                    id
                    noticeId
                    userId
                    userName
                    timestamp
                }
            }
        }
    `;
    
    try {
        const data = await graphqlRequest(query);
        return data.listSignatures.items;
    } catch (error) {
        console.error('Failed to fetch signatures:', error);
        return [];
    }
}

// Create New Notice in Database
async function createNoticeInDB(noticeData) {
    const mutation = `
        mutation CreateNotice($input: CreateNoticeInput!) {
            createNotice(input: $input) {
                id
                title
                content
                category
                priority
                author
                source
                isPinned
                requiresSignature
                createdAt
                expiresAt
                tags
            }
        }
    `;
    
    const variables = {
        input: noticeData
    };
    
    try {
        const data = await graphqlRequest(mutation, variables);
        return data.createNotice;
    } catch (error) {
        console.error('Failed to create notice:', error);
        throw error;
    }
}

// Create Signature in Database
async function createSignatureInDB(signatureData) {
    const mutation = `
        mutation CreateSignature($input: CreateSignatureInput!) {
            createSignature(input: $input) {
                id
                noticeId
                userId
                userName
                timestamp
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
            timestamp: signatureData.timestamp
        }
    };
    
    try {
        const data = await graphqlRequest(mutation, variables);
        return data.createSignature;
    } catch (error) {
        console.error('Signature creation failed:', error);
        throw error;
    }
}

// AKL NoticeBoard - Complete Application Logic
class AKLNoticeBoard {
    constructor() {
        this.notices = [];
        this.signatures = new Map();
        this.allSignatures = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.currentUser = this.getCurrentUser();
        this.autoRefreshInterval = null;
        this.isAdmin = false;
		this.richTextEditor = null;
        
        // Pagination properties
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.totalPages = 1;
        
        this.init();
    }

    // Initialize the application
    async init() {
        console.log('🚀 Initializing AKL NoticeBoard...');
        
        this.setupEventListeners();
        await this.loadData();
        this.render();
        this.startAutoRefresh();
        
        console.log('✅ AKL NoticeBoard initialized successfully');
    }

    // Get current user (enhanced to store user name)
    getCurrentUser() {
        return {
            id: localStorage.getItem('akl_user_id') || 'user_' + Math.random().toString(36).substr(2, 9),
            name: localStorage.getItem('akl_user_name') || '',
            email: localStorage.getItem('akl_user_email') || '',
            role: localStorage.getItem('akl_user_role') || 'technician'
        };
    }

    // Save current user
    saveCurrentUser(userData) {
        localStorage.setItem('akl_user_id', userData.id);
        localStorage.setItem('akl_user_name', userData.name);
        localStorage.setItem('akl_user_email', userData.email || '');
        this.currentUser = userData;
    }

    // Setup all event listeners
    setupEventListeners() {
        // Navigation buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.setFilter(filter);
            });
        });

        // Search functionality
        const searchInput = document.getElementById('search-notices');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.currentPage = 1; // Reset to first page when searching
                this.render();
            });
        }

        // Mobile menu toggle
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileNav = document.getElementById('mobile-nav');
        if (mobileMenuBtn && mobileNav) {
            mobileMenuBtn.addEventListener('click', () => {
                mobileNav.classList.toggle('hidden');
            });
        }

        // Admin/Post Notice button
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            adminBtn.addEventListener('click', () => {
                this.showPostNoticeModal();
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshData();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'k':
                        e.preventDefault();
                        if (searchInput) searchInput.focus();
                        break;
                    case 'n':
                        e.preventDefault();
                        this.showPostNoticeModal();
                        break;
                    case 'r':
                        e.preventDefault();
                        this.refreshData();
                        break;
                    // Pagination shortcuts
                    case 'ArrowLeft':
                        e.preventDefault();
                        this.previousPage();
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        this.nextPage();
                        break;
                }
            }
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    // Load data from AWS API with signatures
    async loadData() {
        try {
            // Load notices and signatures in parallel
            const [awsNotices, awsSignatures] = await Promise.all([
                fetchNoticesFromDB(),
                fetchSignaturesFromDB()
            ]);
            
            if (awsNotices && awsNotices.length > 0) {
                this.notices = awsNotices;
                console.log('✅ Loaded notices from AWS database:', this.notices);
            } else {
                throw new Error('No AWS notices available');
            }

            if (awsSignatures) {
                this.allSignatures = awsSignatures;
                // Convert to Map for quick lookup by noticeId + userId
                this.signatures = new Map();
                awsSignatures.forEach(sig => {
                    const key = `${sig.noticeId}_${sig.userId}`;
                    this.signatures.set(key, sig);
                });
                console.log('✅ Loaded signatures from AWS database:', awsSignatures);
            }
            
        } catch (error) {
            console.log('📡 AWS API not available, loading sample data...');
            this.loadSampleData();
        }

        this.updateLastUpdated();
    }

    // Load sample data for development/demo
    loadSampleData() {
        this.notices = [
            {
                id: 'notice_001',
                title: 'Critical: New Safety Protocol Implementation',
                content: 'All DCO technicians must complete the new safety training module by EOD Friday. This includes updated lockout/tagout procedures and emergency response protocols.',
                category: 'Safety',
                priority: 'critical',
                author: 'Safety Manager',
                createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                isPinned: true,
                requiresSignature: true,
                source: 'Management Email',
                tags: ['safety', 'training', 'mandatory']
            },
            {
                id: 'notice_002',
                title: 'System Maintenance Window - This Weekend',
                content: 'Scheduled maintenance on all AKL cluster systems this Saturday 2AM-6AM NZST. All non-critical operations should be completed before maintenance window.',
                category: 'Operations',
                priority: 'high',
                author: 'DCEO Manager',
                createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
                expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                isPinned: true,
                requiresSignature: false,
                source: 'TacOps Update',
                tags: ['maintenance', 'weekend', 'systems']
            },
            {
                id: 'notice_003',
                title: 'Updated Badge Access Procedures',
                content: 'New badge access procedures are now in effect. Please ensure you tap your badge at all entry points and report any access issues immediately.',
                category: 'Policy',
                priority: 'medium',
                author: 'Security Team',
                createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                isPinned: false,
                requiresSignature: true,
                source: 'Security Policy',
                tags: ['security', 'access', 'policy']
            },
            {
                id: 'notice_004',
                title: 'TacOps Feedback Summary - Week 47',
                content: 'Great work this week team! Overall performance metrics are up 15%. Special recognition to AKL53 team for zero incidents this week.',
                category: 'Feedback',
                priority: 'low',
                author: 'TacOps Team',
                createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
                expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                isPinned: false,
                requiresSignature: false,
                source: 'TacOps Spreadsheet',
                tags: ['feedback', 'performance', 'recognition']
            },
            {
                id: 'notice_005',
                title: 'System Test',
                content: 'This is Prototype to showcase the System aka AKL NoticeBoard.',
                category: 'coffee',
                priority: 'medium',
                author: 'coffee',
                createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
                expiresAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
                isPinned: false,
                requiresSignature: false,
                source: 'coffee',
                tags: ['BETA', 'test']
            }
        ];
    }

    // Set current filter with pagination reset
    setFilter(filter) {
        this.currentFilter = filter;
        this.currentPage = 1; // Reset to first page when changing filters
        
        // Update navigation buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll(`[data-filter="${filter}"]`).forEach(btn => {
            btn.classList.add('active');
        });

        this.render();
    }

    // Get filtered notices with pagination
    getFilteredNotices() {
        let filtered = [...this.notices];

        // Apply search filter
        if (this.searchQuery) {
            filtered = filtered.filter(notice => 
                notice.title.toLowerCase().includes(this.searchQuery) ||
                notice.content.toLowerCase().includes(this.searchQuery) ||
                notice.category.toLowerCase().includes(this.searchQuery) ||
                notice.author.toLowerCase().includes(this.searchQuery) ||
                (notice.tags && notice.tags.some(tag => tag.toLowerCase().includes(this.searchQuery)))
            );
        }

        // Apply category filter
        switch (this.currentFilter) {
            case 'pinned':
                filtered = filtered.filter(notice => notice.isPinned);
                break;
            case 'unsigned':
                filtered = filtered.filter(notice => 
                    notice.requiresSignature && !this.isNoticeSigned(notice.id)
                );
                break;
            case 'categories':
                // For categories view, we'll handle pagination differently
                break;
            case 'all':
            default:
                // No additional filtering
                break;
        }

        // ENHANCED SORTING: Pinned first, then by creation date (newest first)
        filtered.sort((a, b) => {
            // First priority: pinned notices
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            
            // Second priority: creation date (newest first)
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        // Calculate pagination
        this.totalPages = Math.ceil(filtered.length / this.itemsPerPage);
        
        // Ensure current page is valid
        if (this.currentPage > this.totalPages && this.totalPages > 0) {
            this.currentPage = this.totalPages;
        }
        if (this.currentPage < 1) {
            this.currentPage = 1;
        }

        // Apply pagination (except for categories view)
        if (this.currentFilter !== 'categories') {
            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            const endIndex = startIndex + this.itemsPerPage;
            filtered = filtered.slice(startIndex, endIndex);
        }

        return filtered;
    }

    // Get all filtered notices (without pagination) for total count
    getAllFilteredNotices() {
        let filtered = [...this.notices];

        // Apply search filter
        if (this.searchQuery) {
            filtered = filtered.filter(notice => 
                notice.title.toLowerCase().includes(this.searchQuery) ||
                notice.content.toLowerCase().includes(this.searchQuery) ||
                notice.category.toLowerCase().includes(this.searchQuery) ||
                notice.author.toLowerCase().includes(this.searchQuery) ||
                (notice.tags && notice.tags.some(tag => tag.toLowerCase().includes(this.searchQuery)))
            );
        }

        // Apply category filter
        switch (this.currentFilter) {
            case 'pinned':
                filtered = filtered.filter(notice => notice.isPinned);
                break;
            case 'unsigned':
                filtered = filtered.filter(notice => 
                    notice.requiresSignature && !this.isNoticeSigned(notice.id)
                );
                break;
        }

        return filtered;
    }

    // Check if notice is signed by current user
    isNoticeSigned(noticeId) {
        const key = `${noticeId}_${this.currentUser.id}`;
        return this.signatures.has(key);
    }

    // Get signature info for a notice by current user
    getSignatureInfo(noticeId) {
        const key = `${noticeId}_${this.currentUser.id}`;
        return this.signatures.get(key);
    }

    // Pagination methods
    goToPage(page) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.render();
            this.scrollToTop();
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.render();
            this.scrollToTop();
        }
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.render();
            this.scrollToTop();
        }
    }

    scrollToTop() {
        const noticeBoard = document.getElementById('notice-board');
        if (noticeBoard) {
            noticeBoard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Render the notice board with pagination
    render() {
        const filtered = this.getFilteredNotices();
        const allFiltered = this.getAllFilteredNotices();
        const noticeBoard = document.getElementById('notice-board');
        const emptyState = document.getElementById('empty-state');

        if (!noticeBoard) return;

        // Update status bar
        this.updateStatusBar(allFiltered);

        // Render filter pills
        this.renderFilterPills();

        if (allFiltered.length === 0) {
            noticeBoard.innerHTML = '';
            this.hidePagination();
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        if (this.currentFilter === 'categories') {
            this.renderByCategories(filtered);
            this.hidePagination(); // Categories view doesn't use pagination
        } else {
            this.renderNoticeList(filtered);
            this.renderPagination(allFiltered.length);
        }
    }

    // Render notices as a list
    renderNoticeList(notices) {
        const noticeBoard = document.getElementById('notice-board');
        
        noticeBoard.innerHTML = notices.map(notice => this.renderNoticeCard(notice)).join('');
        
        // Add event listeners to signature buttons
        this.attachSignatureListeners();
    }

    // Render notices grouped by categories
    renderByCategories(notices) {
        const noticeBoard = document.getElementById('notice-board');
        const categories = {};
        
        // Group notices by category
        notices.forEach(notice => {
            if (!categories[notice.category]) {
                categories[notice.category] = [];
            }
            categories[notice.category].push(notice);
        });

        const categoryHtml = Object.entries(categories).map(([category, categoryNotices]) => `
            <div class="category-section mb-8">
                <div class="flex items-center space-x-3 mb-4">
                    <h2 class="text-2xl font-bold text-slate-100">${this.getCategoryIcon(category)} ${category}</h2>
                    <span class="bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-sm font-medium">
                        ${categoryNotices.length} notice${categoryNotices.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div class="space-y-4">
                    ${categoryNotices.map(notice => this.renderNoticeCard(notice)).join('')}
                </div>
            </div>
        `).join('');

        noticeBoard.innerHTML = categoryHtml;
        this.attachSignatureListeners();
    }

    // Render pagination controls
    renderPagination(totalItems) {
        const paginationContainer = document.getElementById('pagination-container');
        if (!paginationContainer) return;

        if (totalItems <= this.itemsPerPage) {
            this.hidePagination();
            return;
        }

        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, totalItems);

        // Generate page numbers to show
        const pageNumbers = this.generatePageNumbers();

        const paginationHtml = `
            <div class="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
                <!-- Results Info -->
                <div class="text-sm text-slate-400">
                    Showing <span class="font-medium text-slate-200">${startItem}</span> to 
                    <span class="font-medium text-slate-200">${endItem}</span> of 
                    <span class="font-medium text-slate-200">${totalItems}</span> notices
                </div>

                <!-- Pagination Controls -->
                <div class="flex items-center space-x-2">
                    <!-- Previous Button -->
                    <button onclick="window.noticeBoard.previousPage()" 
                            class="pagination-btn ${this.currentPage === 1 ? 'disabled' : ''}"
                            ${this.currentPage === 1 ? 'disabled' : ''}>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                        Previous
                    </button>

                    <!-- Page Numbers -->
                    <div class="flex items-center space-x-1">
                        ${pageNumbers.map(page => {
                            if (page === '...') {
                                return '<span class="px-3 py-2 text-slate-400">...</span>';
                            }
                            return `
                                <button onclick="window.noticeBoard.goToPage(${page})" 
                                        class="pagination-number ${page === this.currentPage ? 'active' : ''}">
                                    ${page}
                                </button>
                            `;
                        }).join('')}
                    </div>

                    <!-- Next Button -->
                    <button onclick="window.noticeBoard.nextPage()" 
                            class="pagination-btn ${this.currentPage === this.totalPages ? 'disabled' : ''}"
                            ${this.currentPage === this.totalPages ? 'disabled' : ''}>
                        Next
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        paginationContainer.innerHTML = paginationHtml;
        paginationContainer.classList.remove('hidden');
    }

    // Generate smart page numbers (shows ... for large page counts)
    generatePageNumbers() {
        const pages = [];
        const totalPages = this.totalPages;
        const current = this.currentPage;

        if (totalPages <= 7) {
            // Show all pages if 7 or fewer
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Smart pagination for many pages
            if (current <= 4) {
                // Near the beginning
                for (let i = 1; i <= 5; i++) {
                    pages.push(i);
                }
                pages.push('...');
                pages.push(totalPages);
            } else if (current >= totalPages - 3) {
                // Near the end
                pages.push(1);
                pages.push('...');
                for (let i = totalPages - 4; i <= totalPages; i++) {
                    pages.push(i);
                }
            } else {
                // In the middle
                pages.push(1);
                pages.push('...');
                for (let i = current - 1; i <= current + 1; i++) {
                    pages.push(i);
                }
                pages.push('...');
                pages.push(totalPages);
            }
        }

        return pages;
    }

    // Hide pagination
    hidePagination() {
        const paginationContainer = document.getElementById('pagination-container');
        if (paginationContainer) {
            paginationContainer.classList.add('hidden');
        }
    }

    // Complete the renderNoticeCard method with better date formatting
renderNoticeCard(notice) {
        const isExpired = notice.expiresAt && new Date(notice.expiresAt) < new Date();
        const isSigned = this.isNoticeSigned(notice.id);
        const signatureInfo = this.getSignatureInfo(notice.id);
        const timeAgo = this.getTimeAgo(notice.createdAt);
        const fullDateTime = this.getFullDateTime(notice.createdAt);
        const expiresIn = notice.expiresAt ? this.getExpiresIn(notice.expiresAt) : '';

        return `
            <div class="notice-card notice-${notice.priority} ${notice.isPinned ? 'notice-pinned' : ''} ${isExpired ? 'opacity-60' : ''}" data-notice-id="${notice.id}">
                <!-- Notice Header -->
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <div class="flex items-center space-x-3 mb-2">
                            <span class="priority-badge priority-${notice.priority}">
                                ${this.getPriorityIcon(notice.priority)} ${notice.priority.toUpperCase()}
                            </span>
                            <span class="category-badge">
                                ${this.getCategoryIcon(notice.category)} ${notice.category}
                            </span>
                            ${notice.isPinned ? '<span class="text-amber-400 text-sm font-medium">📌 PINNED</span>' : ''}
                        </div>
                        <h3 class="text-xl font-bold text-slate-100 mb-2">${notice.title}</h3>
                        <div class="flex flex-col md:flex-row md:items-center md:space-x-4 text-sm text-slate-400 space-y-1 md:space-y-0">
                            <span>👤 ${notice.author}</span>
                            <span title="${fullDateTime}">📅 ${timeAgo}</span>
                            <span>📍 ${notice.source}</span>
                            ${isExpired ? '<span class="text-red-400">⚠️ EXPIRED</span>' : (expiresIn ? `<span>⏰ Expires ${expiresIn}</span>` : '')}
                        </div>
                    </div>
                </div>

                <!-- Notice Content with Rich Text -->
                <div class="mb-4 notice-content">
                    ${this.renderRichTextContent(notice.content)}
                </div>

                <!-- Tags -->
                ${notice.tags && notice.tags.length > 0 ? `
                    <div class="flex flex-wrap gap-2 mb-4">
                        ${notice.tags.map(tag => `
                            <span class="bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs font-medium">
                                #${tag}
                            </span>
                        `).join('')}
                    </div>
                ` : ''}

                <!-- Signature Section -->
                ${notice.requiresSignature ? `
                    <div class="signature-section ${isSigned ? 'signature-completed' : 'signature-required'}">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                ${isSigned ? `
                                    <div class="flex items-center space-x-2 text-green-400">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        <span class="font-medium">Acknowledged by ${signatureInfo.userName}</span>
                                    </div>
                                    <div class="text-sm text-slate-400">
                                        ${this.getTimeAgo(signatureInfo.timestamp)}
                                    </div>
                                ` : `
                                    <div class="flex items-center space-x-2 text-amber-400">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"></path>
                                        </svg>
                                        <span class="font-medium">Acknowledgment Required</span>
                                    </div>
                                    <div class="text-sm text-slate-400">
                                        Please acknowledge this notice
                                    </div>
                                `}
                            </div>
                            ${!isSigned && !isExpired ? `
                                <button class="sign-btn" data-notice-id="${notice.id}">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                                    </svg>
                                    Acknowledge Notice
                                </button>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }
	
	// NEW: Render rich text content
    renderRichTextContent(content) {
        // If content contains HTML tags, render as HTML
        if (content && (content.includes('<') || content.includes('&'))) {
            return content;
        }
        // Otherwise, treat as plain text and convert line breaks
        return content ? content.replace(/\n/g, '<br>') : '';
    }

    // Helper methods
    getPriorityIcon(priority) {
        const icons = {
            critical: '🚨',
            high: '⚠️',
            medium: '📋',
            low: '💡'
        };
        return icons[priority] || '📋';
    }

    getCategoryIcon(category) {
        const icons = {
            Safety: '🦺',
            Operations: '⚙️',
            Policy: '📜',
            HR: '👥',
            Feedback: '💬',
            Training: '🎓',
            Maintenance: '🔧',
            coffee: '☕'
        };
        return icons[category] || '📋';
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffInSeconds = Math.floor((now - time) / 1000);
        
        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        
        return time.toLocaleDateString();
    }

    // Get full date and time formatting
    getFullDateTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-NZ', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Pacific/Auckland'
        });
    }

    getExpiresIn(timestamp) {
        const now = new Date();
        const expiry = new Date(timestamp);
        const diffInSeconds = Math.floor((expiry - now) / 1000);
        
        if (diffInSeconds < 0) return 'Expired';
        if (diffInSeconds < 3600) return `in ${Math.floor(diffInSeconds / 60)}m`;
        if (diffInSeconds < 86400) return `in ${Math.floor(diffInSeconds / 3600)}h`;
        if (diffInSeconds < 604800) return `in ${Math.floor(diffInSeconds / 86400)}d`;
        
        return `on ${expiry.toLocaleDateString()}`;
    }

    // Signature handling
    attachSignatureListeners() {
        document.querySelectorAll('.sign-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const noticeId = e.target.closest('.sign-btn').dataset.noticeId;
                this.showSignatureModal(noticeId);
            });
        });
    }

    // Show signature modal to collect user name
    showSignatureModal(noticeId) {
        const notice = this.notices.find(n => n.id === noticeId);
        if (!notice) return;

        // Check if already signed
        if (this.isNoticeSigned(noticeId)) {
            this.showToast('You have already acknowledged this notice!', 'warning');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content w-full max-w-md">
                <div class="bg-slate-800 px-6 py-4 border-b border-slate-700">
                    <h2 class="text-xl font-bold text-slate-100">✍️ Acknowledge Notice</h2>
                </div>
                <div class="p-6">
                    <div class="mb-4">
                        <h3 class="font-semibold text-slate-200 mb-2">${notice.title}</h3>
                        <p class="text-sm text-slate-400">Please enter your name/alias to acknowledge this notice:</p>
                    </div>
                    <form id="signature-form" class="space-y-4">
                        <div class="form-group">
                            <label class="form-label">Your Name/Alias *</label>
                            <input type="text" name="userName" class="form-input" required 
                                   placeholder="Enter your name or alias" 
                                   value="${this.currentUser.name}">
                        </div>
                    </form>
                </div>
                <div class="bg-slate-800 px-6 py-4 border-t border-slate-700 flex justify-end space-x-3">
                    <button onclick="this.closest('.modal').remove()" class="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button onclick="confirmSignature('${noticeId}')" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors">
                        ✍️ Acknowledge
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').appendChild(modal);
        
        // Focus on input
        setTimeout(() => {
            const input = modal.querySelector('input[name="userName"]');
            if (input) input.focus();
        }, 100);
    }

    // Sign notice with user name collection
    async signNotice(noticeId, userName) {
        if (!userName || userName.trim() === '') {
            this.showToast('Please enter your name/alias', 'error');
            return;
        }

        // Check if already signed
        if (this.isNoticeSigned(noticeId)) {
            this.showToast('You have already acknowledged this notice!', 'warning');
            return;
        }

        const signature = {
            userId: this.currentUser.id,
            userName: userName.trim(),
            timestamp: new Date().toISOString()
        };
        
        // Update current user name if provided
        if (userName.trim() !== this.currentUser.name) {
            this.saveCurrentUser({
                ...this.currentUser,
                name: userName.trim()
            });
        }
        
        try {
            // Try to save to AWS first
            await createSignatureInDB({
                noticeId: noticeId,
                userId: signature.userId,
                userName: signature.userName,
                timestamp: signature.timestamp
            });
            
            // Add to local signatures map
            const key = `${noticeId}_${signature.userId}`;
            this.signatures.set(key, signature);
            
            this.render();
            this.closeAllModals();
            this.showToast('Notice acknowledged successfully!', 'success');
            
        } catch (error) {
            console.log('AWS signature failed, saving locally:', error);
            
            // Fallback to local storage
            const key = `${noticeId}_${signature.userId}`;
            this.signatures.set(key, signature);
            this.saveSignatures();
            
            this.render();
            this.closeAllModals();
            this.showToast('Notice acknowledged locally!', 'warning');
        }
    }

    saveSignatures() {
        const signaturesArray = Array.from(this.signatures.entries()).map(([key, value]) => ({
            key,
            ...value
        }));
        localStorage.setItem('akl_signatures', JSON.stringify(signaturesArray));
    }

    // Status bar updates with pagination info
    updateStatusBar(allFilteredNotices) {
        const totalNoticesEl = document.getElementById('total-notices');
        const unsignedCountEl = document.getElementById('unsigned-count');
        
        if (totalNoticesEl) totalNoticesEl.textContent = this.notices.length;
        
        const unsignedCount = this.notices.filter(notice => 
            notice.requiresSignature && !this.isNoticeSigned(notice.id)
        ).length;
        if (unsignedCountEl) unsignedCountEl.textContent = unsignedCount;
        
        // Update new notice indicator
        const indicator = document.getElementById('new-notice-indicator');
        if (indicator) {
            if (unsignedCount > 0) {
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        }
    }

    updateLastUpdated() {
        const now = new Date();
        const lastUpdatedEl = document.getElementById('last-updated');
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = `Last updated: ${now.toLocaleTimeString()}`;
        }
    }

    // Filter pills rendering
    renderFilterPills() {
        const container = document.getElementById('filter-pills');
        if (!container) return;
        
        const pills = [];
        
        if (this.searchQuery) {
            pills.push(`
                <span class="filter-pill active">
                    🔍 "${this.searchQuery}"
                    <button onclick="clearSearch()" class="ml-2 text-red-400">×</button>
                </span>
            `);
        }
        
        if (this.currentFilter !== 'all') {
            const filterNames = {
                pinned: '📌 Pinned Only',
                unsigned: '✍️ Needs Signature',
                categories: '🏷️ By Category'
            };
            
            pills.push(`
                <span class="filter-pill active">
                    ${filterNames[this.currentFilter]}
                    <button onclick="clearFilter()" class="ml-2 text-red-400">×</button>
                </span>
            `);
        }
        
        container.innerHTML = pills.join('');
    }

    // Auto refresh functionality
    startAutoRefresh() {
        this.autoRefreshInterval = setInterval(() => {
            this.refreshData();
        }, 60000); // Refresh every 1 minute
    }

    async refreshData() {
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) refreshBtn.classList.add('loading');
        
        try {
            await this.loadData();
            this.render();
            this.showToast('Data refreshed successfully!', 'success');
        } catch (error) {
            this.showToast('Failed to refresh data', 'error');
        } finally {
            if (refreshBtn) refreshBtn.classList.remove('loading');
        }
    }

    // Toast notifications
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        toast.innerHTML = `
            <div class="flex items-center space-x-3">
                <span class="text-lg">${icons[type]}</span>
                <span class="flex-1">${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="text-slate-400 hover:text-white">×</button>
            </div>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

// UPDATED: Modal functionality with better structure and scrolling
showPostNoticeModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content w-full max-w-4xl">
            <!-- Modal Header -->
            <div class="modal-header">
                <h2 class="text-xl font-bold text-slate-100">📝 Post New Notice</h2>
            </div>
            
            <!-- Modal Body - Scrollable -->
            <div class="modal-body">
                <form id="post-notice-form" class="space-y-4">
                    <div class="form-group">
                        <label class="form-label">Your Name/Alias *</label>
                        <input type="text" name="author" class="form-input" required 
                               placeholder="Enter your name or alias" 
                               value="${this.currentUser.name}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Title *</label>
                        <input type="text" name="title" class="form-input" required 
                               placeholder="Enter notice title">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Content *</label>
                        <div id="rich-text-editor" class="rich-text-editor"></div>
                        <input type="hidden" name="content" id="hidden-content">
                        <p class="text-xs text-slate-400 mt-2">
                            💡 Use the toolbar above to format your content with headers, lists, bold text, and more!
                        </p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="form-group">
                            <label class="form-label">Category *</label>
                            <select name="category" class="form-select" required>
                                <option value="">Select Category</option>
                                <option value="Safety">🦺 Safety</option>
                                <option value="Operations">⚙️ Operations</option>
                                <option value="Policy">📜 Policy</option>
                                <option value="HR">👥 HR</option>
                                <option value="Training">🎓 Training</option>
                                <option value="Maintenance">🔧 Maintenance</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Priority *</label>
                            <select name="priority" class="form-select" required>
                                <option value="">Select Priority</option>
                                <option value="critical">🚨 Critical</option>
                                <option value="high">⚠️ High</option>
                                <option value="medium">📋 Medium</option>
                                <option value="low">💡 Low</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tags (comma-separated)</label>
                        <input type="text" name="tags" class="form-input" 
                               placeholder="safety, training, mandatory">
                        <p class="text-xs text-slate-400 mt-1">
                            Add tags to help categorize and search for this notice
                        </p>
                    </div>
                    <div class="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
                        <label class="flex items-center space-x-2">
                            <input type="checkbox" name="isPinned" class="rounded">
                            <span class="text-sm">📌 Pin this notice to the top</span>
                        </label>
                        <label class="flex items-center space-x-2">
                            <input type="checkbox" name="requiresSignature" class="rounded">
                            <span class="text-sm">✍️ Requires acknowledgment</span>
                        </label>
                    </div>
                </form>
            </div>
            
            <!-- Modal Footer -->
            <div class="modal-footer">
                <button onclick="this.closest('.modal').remove()" 
                        class="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors">
                    Cancel
                </button>
                <button onclick="submitNotice()" 
                        class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors">
                    📝 Post Notice
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('modal-container').appendChild(modal);
    
    // Initialize rich text editor
    setTimeout(() => {
        this.initializeRichTextEditor();
        const authorInput = modal.querySelector('input[name="author"]');
        if (authorInput && !authorInput.value) {
            authorInput.focus();
        }
    }, 100);
}

	
	// NEW: Initialize rich text editor
    initializeRichTextEditor() {
        const editorContainer = document.getElementById('rich-text-editor');
        if (!editorContainer || typeof Quill === 'undefined') return;

        this.richTextEditor = new Quill('#rich-text-editor', {
            theme: 'snow',
            placeholder: 'Write your notice content here...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    ['blockquote', 'code-block'],
                    ['link'],
                    [{ 'align': [] }],
                    ['clean']
                ]
            }
        });

        // Set dark theme colors
        const toolbar = editorContainer.querySelector('.ql-toolbar');
        const container = editorContainer.querySelector('.ql-container');
        
        if (toolbar) {
            toolbar.style.backgroundColor = '#1e293b';
            toolbar.style.borderColor = '#374151';
        }
        
        if (container) {
            container.style.backgroundColor = '#0f172a';
            container.style.borderColor = '#374151';
            container.style.color = '#e5e7eb';
        }
    }

    closeAllModals() {
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) modalContainer.innerHTML = '';
    }
}

// Global helper functions
function clearSearch() {
    const searchInput = document.getElementById('search-notices');
    if (searchInput) searchInput.value = '';
    if (window.noticeBoard) {
        window.noticeBoard.searchQuery = '';
        window.noticeBoard.currentPage = 1; // Reset to first page
        window.noticeBoard.render();
    }
}

function clearFilter() {
    if (window.noticeBoard) {
        window.noticeBoard.setFilter('all');
    }
}

function clearAllFilters() {
    clearSearch();
    clearFilter();
}

// Confirm signature with name validation
function confirmSignature(noticeId) {
    const form = document.getElementById('signature-form');
    const formData = new FormData(form);
    const userName = formData.get('userName');
    
    if (window.noticeBoard) {
        window.noticeBoard.signNotice(noticeId, userName);
    }
}

// Submit notice with author name validation
function submitNotice() {
    const form = document.getElementById('post-notice-form');
    const formData = new FormData(form);
    
    const authorName = formData.get('author');
    if (!authorName || authorName.trim() === '') {
        window.noticeBoard.showToast('Please enter your name/alias', 'error');
        return;
    }

    // Get rich text content
    let content = '';
    if (window.noticeBoard.richTextEditor) {
        content = window.noticeBoard.richTextEditor.root.innerHTML;
        // Check if editor has actual content (not just empty tags)
        const textContent = window.noticeBoard.richTextEditor.getText().trim();
        if (!textContent) {
            window.noticeBoard.showToast('Please enter notice content', 'error');
            return;
        }
    } else {
        content = formData.get('content');
        if (!content || content.trim() === '') {
            window.noticeBoard.showToast('Please enter notice content', 'error');
            return;
        }
    }
    
    const notice = {
        title: formData.get('title'),
        content: content,
        category: formData.get('category'),
        priority: formData.get('priority'),
        author: authorName.trim(),
        source: 'NoticeBoard',
        isPinned: formData.get('isPinned') === 'on',
        requiresSignature: formData.get('requiresSignature') === 'on',
        tags: formData.get('tags') ? formData.get('tags').split(',').map(tag => tag.trim()) : []
    };
    
    // Update current user name if different
    if (authorName.trim() !== window.noticeBoard.currentUser.name) {
        window.noticeBoard.saveCurrentUser({
            ...window.noticeBoard.currentUser,
            name: authorName.trim()
        });
    }
    
    // Try to save to AWS first
    createNoticeInDB(notice).then(awsNotice => {
        window.noticeBoard.notices.unshift(awsNotice);
        window.noticeBoard.currentPage = 1;
        window.noticeBoard.render();
        window.noticeBoard.closeAllModals();
        window.noticeBoard.showToast('Notice posted successfully!', 'success');
    }).catch(error => {
        console.log('AWS save failed, saving locally:', error);
        const localNotice = {
            id: 'notice_' + Date.now(),
            ...notice,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
        window.noticeBoard.notices.unshift(localNotice);
        window.noticeBoard.currentPage = 1;
        window.noticeBoard.render();
        window.noticeBoard.closeAllModals();
        window.noticeBoard.showToast('Notice posted locally!', 'warning');
    });
}

// Initialize the application
window.addEventListener('DOMContentLoaded', () => {
    window.noticeBoard = new AKLNoticeBoard();
});
