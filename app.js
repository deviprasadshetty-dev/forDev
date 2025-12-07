/**
 * forDev - Developer News Client
 * A beautiful daily.dev-inspired interface for Hacker News
 */

// API Endpoints
const HN_API = {
    topStories: 'https://hacker-news.firebaseio.com/v0/topstories.json',
    bestStories: 'https://hacker-news.firebaseio.com/v0/beststories.json',
    newStories: 'https://hacker-news.firebaseio.com/v0/newstories.json',
    askStories: 'https://hacker-news.firebaseio.com/v0/askstories.json',
    showStories: 'https://hacker-news.firebaseio.com/v0/showstories.json',
    jobStories: 'https://hacker-news.firebaseio.com/v0/jobstories.json',
    item: (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`
};

// Feed Types Configuration
const FEED_CONFIG = {
    top: { title: 'Top Stories', endpoint: HN_API.topStories, icon: '🔥' },
    best: { title: 'Best Stories', endpoint: HN_API.bestStories, icon: '⭐' },
    new: { title: 'New Stories', endpoint: HN_API.newStories, icon: '🆕' },
    ask: { title: 'Ask HN', endpoint: HN_API.askStories, icon: '❓' },
    show: { title: 'Show HN', endpoint: HN_API.showStories, icon: '🎯' },
    job: { title: 'Jobs', endpoint: HN_API.jobStories, icon: '💼' }
};

// Storage helper (works with both localStorage and chrome.storage)
const storage = {
    get: (key, defaultValue = []) => {
        try {
            return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue));
        } catch {
            return defaultValue;
        }
    },
    set: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('Storage error:', e);
        }
    }
};

// App State
const state = {
    currentFeed: 'top',
    stories: [],
    storyIds: [],
    displayedCount: 0,
    storiesPerPage: 20,
    bookmarks: storage.get('hn-bookmarks', []),
    history: storage.get('hn-history', []),
    isLoading: false,
    searchQuery: '',
    showBookmarks: false,
    showHistory: false
};

// DOM Elements
const elements = {
    storiesGrid: document.getElementById('stories-grid'),
    storiesList: document.getElementById('stories-list'),
    loadingSkeleton: document.getElementById('loading-skeleton'),
    loadMoreContainer: document.getElementById('load-more-container'),
    loadMoreBtn: document.getElementById('load-more-btn'),
    feedTitle: document.getElementById('feed-title'),
    storyCount: document.getElementById('story-count'),
    lastUpdated: document.getElementById('last-updated'),
    refreshBtn: document.getElementById('refresh-btn'),
    bookmarkCount: document.getElementById('bookmark-count'),
    emptyState: document.getElementById('empty-state'),
    toastContainer: document.getElementById('toast-container')
};

// Initialize App
document.addEventListener('DOMContentLoaded', init);

function init() {
    setupEventListeners();
    updateBookmarkCount();
    loadFeed(state.currentFeed);
}

// Event Listeners
function setupEventListeners() {
    // Navigation items
    document.querySelectorAll('[data-feed]').forEach(btn => {
        btn.addEventListener('click', () => {
            const feed = btn.dataset.feed;
            setActiveFeed(feed);
            loadFeed(feed);
        });
    });

    // Bookmarks button
    document.getElementById('bookmarks-btn').addEventListener('click', () => {
        state.showBookmarks = true;
        state.showHistory = false;
        showBookmarkedStories();
    });

    // History button
    document.getElementById('history-btn').addEventListener('click', () => {
        state.showHistory = true;
        state.showBookmarks = false;
        showHistoryStories();
    });



    // Refresh button
    elements.refreshBtn.addEventListener('click', refreshFeed);

    // Load more button
    elements.loadMoreBtn.addEventListener('click', loadMoreStories);
}



// Set Active Feed
function setActiveFeed(feed) {
    state.currentFeed = feed;
    state.showBookmarks = false;
    state.showHistory = false;

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    const activeBtn = document.querySelector(`[data-feed="${feed}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

// Load Feed
async function loadFeed(feedType) {
    if (state.isLoading) return;

    state.isLoading = true;
    state.displayedCount = 0;
    state.stories = [];

    showLoadingSkeleton();

    try {
        const config = FEED_CONFIG[feedType];
        elements.feedTitle.textContent = config.title;

        // Fetch story IDs
        const response = await fetch(config.endpoint);
        state.storyIds = await response.json();

        // Load first batch of stories
        await loadMoreStories();

        updateLastUpdated();

    } catch (error) {
        console.error('Error loading feed:', error);
        showToast('Failed to load stories', 'error');
    }

    state.isLoading = false;
}

// Load More Stories
async function loadMoreStories() {
    const startIndex = state.displayedCount;
    const endIndex = Math.min(startIndex + state.storiesPerPage, state.storyIds.length);

    if (startIndex >= state.storyIds.length) {
        elements.loadMoreContainer.classList.add('hidden');
        return;
    }

    const idsToLoad = state.storyIds.slice(startIndex, endIndex);
    const newStories = await Promise.all(
        idsToLoad.map(id => fetchStory(id))
    );

    state.stories = [...state.stories, ...newStories.filter(s => s !== null)];
    state.displayedCount = endIndex;

    hideLoadingSkeleton();
    filterAndDisplayStories();

    // Show/hide load more button
    if (endIndex < state.storyIds.length) {
        elements.loadMoreContainer.classList.remove('hidden');
    } else {
        elements.loadMoreContainer.classList.add('hidden');
    }
}

// Fetch Single Story
async function fetchStory(id) {
    try {
        const response = await fetch(HN_API.item(id));
        return await response.json();
    } catch (error) {
        console.error(`Error fetching story ${id}:`, error);
        return null;
    }
}

// Filter and Display Stories
function filterAndDisplayStories() {
    let filteredStories = state.stories;

    // Apply search filter
    if (state.searchQuery) {
        filteredStories = filteredStories.filter(story =>
            story.title?.toLowerCase().includes(state.searchQuery) ||
            story.by?.toLowerCase().includes(state.searchQuery) ||
            extractDomain(story.url)?.toLowerCase().includes(state.searchQuery)
        );
    }

    // Update story count
    elements.storyCount.textContent = `${filteredStories.length} stories`;

    // Show empty state or stories
    if (filteredStories.length === 0) {
        elements.storiesGrid.classList.add('hidden');
        elements.storiesList.classList.add('hidden');
        elements.emptyState.classList.remove('hidden');
        elements.emptyState.classList.add('flex');
    } else {
        elements.emptyState.classList.add('hidden');
        elements.emptyState.classList.remove('flex');
        displayStories(filteredStories);
    }
}

// Display Stories
function displayStories(stories) {
    // Ensure loading skeleton is fully hidden and cleared when displaying stories
    elements.loadingSkeleton.classList.add('hidden');
    elements.loadingSkeleton.innerHTML = '';

    // Always use grid view
    elements.storiesGrid.classList.remove('hidden');
    elements.storiesList.classList.add('hidden');
    elements.storiesGrid.innerHTML = stories.map((story, index) =>
        createStoryCard(story, index + 1)
    ).join('');

    // Add event listeners to new cards
    attachCardEventListeners();
}

// Create Story Card (Grid View)
function createStoryCard(story, rank) {
    if (!story) return '';

    const domain = extractDomain(story.url);
    const timeAgo = formatTimeAgo(story.time);
    const isBookmarked = state.bookmarks.includes(story.id);
    const storyUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const commentsUrl = `https://news.ycombinator.com/item?id=${story.id}`;

    return `
        <article class="story-card" data-id="${story.id}">
            <div class="flex items-center justify-between mb-3">
                <span class="source-badge">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                    </svg>
                    ${domain || 'news.ycombinator.com'}
                </span>
                <span class="score-badge">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 3l2.5 5.5L18 9l-4 4 1 5.5-5-3-5 3 1-5.5-4-4 5.5-.5L10 3z"/>
                    </svg>
                    ${story.score || 0}
                </span>
            </div>
            
            <h2 class="title">${escapeHtml(story.title)}</h2>
            
            <div class="meta">
                <span class="meta-item">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                    ${story.descendants || 0}
                </span>
                <span class="meta-item">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    ${timeAgo}
                </span>
            </div>
            
            <div class="author">
                <span>by ${escapeHtml(story.by || 'unknown')}</span>
            </div>
            
            <div class="actions">
                <a href="${storyUrl}" target="_blank" rel="noopener" class="action-btn story-link" onclick="event.stopPropagation();">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                    Read
                </a>
                <a href="${commentsUrl}" target="_blank" rel="noopener" class="action-btn" onclick="event.stopPropagation();">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                    Comments
                </a>
                <button class="action-btn bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-id="${story.id}" onclick="event.stopPropagation(); toggleBookmark(${story.id});">
                    <svg class="w-4 h-4" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                    </svg>
                </button>
            </div>
        </article>
    `;
}

// Create Story List Item (List View)
function createStoryListItem(story, rank) {
    if (!story) return '';

    const domain = extractDomain(story.url);
    const timeAgo = formatTimeAgo(story.time);
    const isBookmarked = state.bookmarks.includes(story.id);
    const storyUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const commentsUrl = `https://news.ycombinator.com/item?id=${story.id}`;

    return `
        <article class="story-list-item" data-id="${story.id}">
            <div class="rank">${rank}</div>
            <div class="content">
                <h2 class="title">${escapeHtml(story.title)}</h2>
                <div class="meta">
                    <span class="meta-item source-badge" style="padding: 2px 6px; font-size: 11px;">
                        ${domain || 'news.ycombinator.com'}
                    </span>
                    <span class="meta-item">
                        <svg viewBox="0 0 20 20" fill="#FF6600">
                            <path d="M10 3l2.5 5.5L18 9l-4 4 1 5.5-5-3-5 3 1-5.5-4-4 5.5-.5L10 3z"/>
                        </svg>
                        ${story.score || 0} points
                    </span>
                    <span class="meta-item">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                        </svg>
                        ${story.descendants || 0} comments
                    </span>
                    <span class="meta-item">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                        </svg>
                        ${escapeHtml(story.by || 'unknown')}
                    </span>
                    <span class="meta-item">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        ${timeAgo}
                    </span>
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <a href="${storyUrl}" target="_blank" rel="noopener" class="action-btn" onclick="event.stopPropagation();">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                </a>
                <a href="${commentsUrl}" target="_blank" rel="noopener" class="action-btn" onclick="event.stopPropagation();">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                </a>
                <button class="action-btn bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-id="${story.id}" onclick="event.stopPropagation(); toggleBookmark(${story.id});">
                    <svg class="w-4 h-4" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                    </svg>
                </button>
            </div>
        </article>
    `;
}

// Attach Card Event Listeners
function attachCardEventListeners() {
    document.querySelectorAll('.story-card, .story-list-item').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.action-btn') || e.target.closest('a')) return;

            const storyId = parseInt(card.dataset.id);
            const story = state.stories.find(s => s.id === storyId);

            if (story) {
                // Add to history
                addToHistory(storyId);

                // Open story
                const url = story.url || `https://news.ycombinator.com/item?id=${storyId}`;
                window.open(url, '_blank');
            }
        });
    });
}

// Toggle Bookmark
function toggleBookmark(storyId) {
    const index = state.bookmarks.indexOf(storyId);

    if (index > -1) {
        state.bookmarks.splice(index, 1);
        showToast('Removed from bookmarks', 'info');
    } else {
        state.bookmarks.push(storyId);
        showToast('Added to bookmarks', 'success');
    }

    storage.set('hn-bookmarks', state.bookmarks);
    updateBookmarkCount();

    // Update bookmark button state
    const btn = document.querySelector(`.bookmark-btn[data-id="${storyId}"]`);
    if (btn) {
        btn.classList.toggle('bookmarked');
        const svg = btn.querySelector('svg');
        svg.setAttribute('fill', state.bookmarks.includes(storyId) ? 'currentColor' : 'none');
    }

    // Refresh if viewing bookmarks
    if (state.showBookmarks) {
        showBookmarkedStories();
    }
}

// Add to History
function addToHistory(storyId) {
    // Remove if exists
    const index = state.history.indexOf(storyId);
    if (index > -1) {
        state.history.splice(index, 1);
    }

    // Add to beginning
    state.history.unshift(storyId);

    // Keep only last 100
    state.history = state.history.slice(0, 100);

    storage.set('hn-history', state.history);
}

// Show Bookmarked Stories
async function showBookmarkedStories() {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById('bookmarks-btn').classList.add('active');

    elements.feedTitle.textContent = '🔖 Bookmarks';

    if (state.bookmarks.length === 0) {
        state.stories = [];
        elements.storyCount.textContent = '0 stories';
        elements.storiesGrid.classList.add('hidden');
        elements.storiesList.classList.add('hidden');
        elements.emptyState.classList.remove('hidden');
        elements.emptyState.classList.add('flex');
        elements.loadMoreContainer.classList.add('hidden');
        return;
    }

    showLoadingSkeleton();

    const bookmarkedStories = await Promise.all(
        state.bookmarks.map(id => fetchStory(id))
    );

    state.stories = bookmarkedStories.filter(s => s !== null);

    hideLoadingSkeleton();
    filterAndDisplayStories();
    elements.loadMoreContainer.classList.add('hidden');
}

// Show History Stories
async function showHistoryStories() {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById('history-btn').classList.add('active');

    elements.feedTitle.textContent = '📜 History';

    if (state.history.length === 0) {
        state.stories = [];
        elements.storyCount.textContent = '0 stories';
        elements.storiesGrid.classList.add('hidden');
        elements.storiesList.classList.add('hidden');
        elements.emptyState.classList.remove('hidden');
        elements.emptyState.classList.add('flex');
        elements.loadMoreContainer.classList.add('hidden');
        return;
    }

    showLoadingSkeleton();

    const historyStories = await Promise.all(
        state.history.slice(0, 50).map(id => fetchStory(id))
    );

    state.stories = historyStories.filter(s => s !== null);

    hideLoadingSkeleton();
    filterAndDisplayStories();
    elements.loadMoreContainer.classList.add('hidden');
}

// View Mode
function setViewMode(mode) {
    console.log('setViewMode called with:', mode);
    console.log('Current stories:', state.stories.length);
    state.viewMode = mode;

    elements.viewGrid.classList.toggle('active', mode === 'grid');
    elements.viewList.classList.toggle('active', mode === 'list');

    filterAndDisplayStories();
    console.log('View mode switched to:', state.viewMode);
}

// Refresh Feed
async function refreshFeed() {
    const icon = elements.refreshBtn.querySelector('svg');
    icon.classList.add('refresh-spin');

    if (state.showBookmarks) {
        await showBookmarkedStories();
    } else if (state.showHistory) {
        await showHistoryStories();
    } else {
        await loadFeed(state.currentFeed);
    }

    icon.classList.remove('refresh-spin');
    showToast('Feed refreshed', 'success');
}

// Update Bookmark Count
function updateBookmarkCount() {
    elements.bookmarkCount.textContent = state.bookmarks.length;
}

// Update Last Updated
function updateLastUpdated() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
    elements.lastUpdated.textContent = `Last updated: ${timeStr}`;
}

// Loading Skeleton
function showLoadingSkeleton() {
    elements.storiesGrid.classList.add('hidden');
    elements.storiesList.classList.add('hidden');
    elements.emptyState.classList.add('hidden');
    elements.loadMoreContainer.classList.add('hidden');

    elements.loadingSkeleton.classList.remove('hidden');
    elements.loadingSkeleton.innerHTML = Array(8).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="flex items-center justify-between mb-4">
                <div class="skeleton h-6 w-24"></div>
                <div class="skeleton h-6 w-12"></div>
            </div>
            <div class="skeleton h-5 w-full mb-2"></div>
            <div class="skeleton h-5 w-3/4 mb-4"></div>
            <div class="flex gap-4">
                <div class="skeleton h-4 w-16"></div>
                <div class="skeleton h-4 w-16"></div>
            </div>
        </div>
    `).join('');
}

function hideLoadingSkeleton() {
    elements.loadingSkeleton.classList.add('hidden');
    elements.loadingSkeleton.innerHTML = ''; // Clear skeleton cards
}

// Toast Notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg class="w-5 h-5 toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
        error: '<svg class="w-5 h-5 toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
        info: '<svg class="w-5 h-5 toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    };

    toast.innerHTML = `
        ${icons[type]}
        <span class="text-sm font-medium">${message}</span>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Utility Functions
function extractDomain(url) {
    if (!url) return null;
    try {
        const hostname = new URL(url).hostname;
        return hostname.replace('www.', '');
    } catch {
        return null;
    }
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';

    const seconds = Math.floor(Date.now() / 1000 - timestamp);

    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval}${unit.charAt(0)} ago`;
        }
    }

    return 'just now';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make toggleBookmark globally available
window.toggleBookmark = toggleBookmark;
