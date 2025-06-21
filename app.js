import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInWithRedirect, 
    getRedirectResult,
    GoogleAuthProvider, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    onSnapshot, 
    deleteDoc, 
    serverTimestamp, 
    query, 
    getDoc, 
    setDoc, 
    updateDoc,
    orderBy 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- App Configuration ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-vibespinner';

const firebaseConfig = window.__firebaseConfig || {
    // fallback for development
    apiKey: "your-dev-api-key",
    authDomain: "your-dev-project.firebaseapp.com",
    projectId: "your-dev-project",
    storageBucket: "your-dev-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

const DEFAULT_TAG_GROUPS = {
    "Type": { tags: ["food", "drink", "place"], logic: "OR" },
    "Cuisine / Style": { tags: ["italian", "mexican", "sushi", "cafe", "cocktails", "brewery"], logic: "OR" },
    "Tag": { tags: ["cozy", "lively", "fancy", "casual", "outdoor", "quick", "coffee"], logic: "OR" }
};

// --- App State ---
let db, auth, currentUser, unsubscribeItems;
let TAG_GROUPS = JSON.parse(JSON.stringify(DEFAULT_TAG_GROUPS));
let allItems = [];
let formSelectedTags = new Set();
let activeFilters = {};

// --- DOM Elements ---
const loadingEl = document.getElementById('loading');
const mainContentEl = document.getElementById('main-content');
const loginSection = document.getElementById('login-section');
const userInfoSection = document.getElementById('user-info-section');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const signoutBtn = document.getElementById('signout-btn');
const googleSigninBtn = document.getElementById('google-signin-btn');
const emailSigninForm = document.getElementById('email-signin-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');

const addItemForm = document.getElementById('add-item-form');
const itemNameInput = document.getElementById('item-name');
const formTagGroupsEl = document.getElementById('form-tag-groups');
const filterTagGroupsEl = document.getElementById('filter-tag-groups');
const resultsSection = document.getElementById('results-section');
const itemListEl = document.getElementById('item-list');
const noResultsContainer = document.getElementById('no-results-container');
const viewAllBtn = document.getElementById('view-all-btn');
const viewAllSection = document.getElementById('view-all-section');
const closeViewAllBtn = document.getElementById('close-view-all-btn');
const allItemsListEl = document.getElementById('all-items-list');
const manageTagsSection = document.getElementById('manage-tags-section').querySelector('.space-y-6');
const userIdDisplay = document.getElementById('user-id-display');

// --- Main App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initializeAppAndAuth();
    setupEventListeners();
});

function initializeAppAndAuth() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        console.log('Firebase initialized, setting up auth listener...');
        
        // Handle redirect result first, then set up auth listener
        handleRedirectResult().then(() => {
            // Set up auth listener after handling redirect
            onAuthStateChanged(auth, async (user) => {
                console.log('Auth state changed:', user ? 'User signed in' : 'User signed out');
                if (user) {
                    console.log('User details:', { uid: user.uid, email: user.email, displayName: user.displayName });
                    currentUser = user;
                    userIdDisplay.textContent = user.email || user.uid;
                    
                    try {
                        console.log('Loading tags...');
                        await loadTags();
                        console.log('Tags loaded successfully');
                        
                        console.log('Setting up Firestore listener...');
                        setupFirestoreListener();
                        console.log('Firestore listener set up');
                        
                        console.log('Showing main content...');
                        showMainContent();
                        console.log('Main content shown');
                    } catch (error) {
                        console.error('Error in auth state change handler:', error);
                        // Still show main content even if there's an error
                        showMainContent();
                    }
                } else {
                    console.log('Showing login content...');
                    showLoginContent();
                }
            });
        });
    } catch (error) { 
        console.error("Firebase initialization failed:", error); 
    }
}

function showMainContent() {
    loadingEl.classList.add('hidden');
    loginSection.classList.add('hidden');
    mainContentEl.classList.remove('hidden');
    userInfoSection.classList.remove('hidden');
    
    // Update user info
    if (currentUser.photoURL) {
        userAvatar.src = currentUser.photoURL;
    } else {
        userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || currentUser.email)}&background=violet&color=white`;
    }
    userName.textContent = currentUser.displayName || 'User';
    userEmail.textContent = currentUser.email;
}

function showLoginContent() {
    loadingEl.classList.add('hidden');
    mainContentEl.classList.add('hidden');
    userInfoSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
}

// --- Authentication Functions ---
async function signInWithGoogle() {
    try {
        const provider = new GoogleAuthProvider();
        // Use redirect instead of popup to avoid COOP issues
        await signInWithRedirect(auth, provider);
    } catch (error) {
        console.error("Google sign-in failed:", error);
        alert("Sign-in failed: " + error.message);
    }
}

// Update the handleRedirectResult function
async function handleRedirectResult() {
    try {
        console.log('Checking for redirect result...');
        const result = await getRedirectResult(auth);
        if (result) {
            console.log('Redirect sign-in successful:', result.user);
            // The onAuthStateChanged listener will handle the rest
        } else {
            console.log('No redirect result found');
        }
    } catch (error) {
        console.error("Redirect sign-in failed:", error);
        // Don't show alert here, let the auth state change handle it
        console.log('Redirect error details:', error);
    }
}

async function signInWithEmail(email, password, isSignUp = false) {
    try {
        if (isSignUp) {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        console.error("Email sign-in failed:", error);
        alert("Sign-in failed: " + error.message);
    }
}

async function signOutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Sign-out failed:", error);
    }
}

// --- Tag Management (Updated for shared collections) ---
async function loadTags() {
    if (!currentUser) return;
    
    // Use shared collection instead of user-specific
    const tagsDocRef = doc(db, `artifacts/${appId}/shared/config/tags`);
    const docSnap = await getDoc(tagsDocRef);
    
    if (docSnap.exists() && docSnap.data().groups) {
        TAG_GROUPS = docSnap.data().groups;
    } else {
        // Initialize shared tags if they don't exist
        await setDoc(tagsDocRef, { 
            groups: DEFAULT_TAG_GROUPS,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp()
        });
        TAG_GROUPS = JSON.parse(JSON.stringify(DEFAULT_TAG_GROUPS));
    }
    initializeAllUI();
}

function initializeAllUI() {
    initializeTagPickers();
    renderTagManagementUI();
}

async function saveNewTag(groupName, newTag) {
    newTag = newTag.toLowerCase().trim();
    if (!newTag || TAG_GROUPS[groupName].tags.includes(newTag)) return;

    TAG_GROUPS[groupName].tags.push(newTag);
    TAG_GROUPS[groupName].tags.sort();
    await updateTagConfigInFirestore();
    
    initializeAllUI();
}

async function deleteExistingTag(groupName, tagToDelete) {
     const tagIndex = TAG_GROUPS[groupName].tags.indexOf(tagToDelete);
     if (tagIndex > -1) {
         TAG_GROUPS[groupName].tags.splice(tagIndex, 1);
         await updateItemsAfterTagDeletion(tagToDelete);
         await updateTagConfigInFirestore();
         initializeAllUI();
     }
}

async function updateItemsAfterTagDeletion(tagToDelete) {
    const itemsToUpdate = allItems.filter(item => item.tags && item.tags.includes(tagToDelete));
    const promises = itemsToUpdate.map(item => {
        const itemRef = doc(db, `artifacts/${appId}/shared/items/${item.id}`);
        const newTags = item.tags.filter(t => t !== tagToDelete);
        return updateDoc(itemRef, { 
            tags: newTags,
            updatedBy: currentUser.uid,
            updatedAt: serverTimestamp()
        });
    });
    await Promise.all(promises);
}

async function updateTagConfigInFirestore() {
    if (!currentUser) return;
    
    // Update shared collection
    const tagsDocRef = doc(db, `artifacts/${appId}/shared/config/tags`);
    await setDoc(tagsDocRef, { 
        groups: TAG_GROUPS,
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp()
    });
}

function initializeTagPickers() {
    formTagGroupsEl.innerHTML = '';
    filterTagGroupsEl.innerHTML = '';
    activeFilters = {};
    const groupOrder = ["Type", "Cuisine / Style", "Tag"];
    groupOrder.forEach(groupName => {
        if (TAG_GROUPS[groupName]) {
            activeFilters[groupName] = new Set();
            const { tags } = TAG_GROUPS[groupName];
            formTagGroupsEl.appendChild(createTagGroup(groupName, tags, 'form'));
            filterTagGroupsEl.appendChild(createTagGroup(groupName, tags, 'filter'));
        }
    });
}

function createTagGroup(name, tags, context) {
    const groupDiv = document.createElement('div');
    if (name === "Cuisine / Style") {
        groupDiv.id = `${context}-cuisine-group`;
        groupDiv.className = 'conditional-group hidden';
    }
    
    groupDiv.innerHTML = `<h4 class="block text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">${name}</h4>`;
    
    const container = document.createElement('div');
    container.className = 'flex flex-wrap gap-2 items-center';
    tags.forEach(tag => container.appendChild(createTagChip(tag, context, name)));
    
    groupDiv.appendChild(container);
    return groupDiv;
}

function createTagChip(tag, context, groupName) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tag;
    button.dataset.tag = tag;
    button.dataset.context = context;
    button.dataset.group = groupName;
    const isSelected = context === 'form' ? formSelectedTags.has(tag) : activeFilters[groupName]?.has(tag);
    button.className = `tag-chip px-4 py-2 text-base font-medium rounded-full cursor-pointer ${isSelected ? 'bg-violet-600 text-white selected' : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500'}`;
    return button;
}

function renderTagManagementUI() {
    manageTagsSection.innerHTML = '';
    const groupOrder = ["Cuisine / Style", "Tag"];
    groupOrder.forEach(groupName => {
        if (TAG_GROUPS[groupName]) {
            const groupDiv = document.createElement('div');
            groupDiv.innerHTML = `<h4 class="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">${groupName}</h4>`;

            const tagList = document.createElement('div');
            tagList.className = 'flex flex-wrap gap-2 mb-3';
            TAG_GROUPS[groupName].tags.forEach(tag => {
                const tagEl = document.createElement('div');
                tagEl.className = 'relative group';
                tagEl.innerHTML = `
                    <span class="bg-slate-200 dark:bg-slate-700 text-base px-4 py-2 rounded-full block">${tag}</span>
                    <button class="delete-tag-btn absolute -top-1.5 -right-1.5 bg-slate-400 text-white rounded-full w-5 h-5 text-xs leading-none hidden group-hover:flex items-center justify-center transition-colors hover:bg-red-500" data-group="${groupName}" data-tag="${tag}">&times;</button>
                `;
                tagList.appendChild(tagEl);
            });
            groupDiv.appendChild(tagList);

            const addForm = document.createElement('form');
            addForm.className = 'flex gap-2 items-center';
            addForm.innerHTML = `
                <input type="text" placeholder="Add new ${groupName.toLowerCase()}" class="flex-1 px-3 py-2 text-base bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition">
                <button type="submit" class="bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 transition">Add</button>
            `;
            groupDiv.appendChild(addForm);
            manageTagsSection.appendChild(groupDiv);
        }
    });
}

// --- Firestore Listener (Updated for shared collections) ---
function setupFirestoreListener() {
    if (!currentUser) return;
    
    if (unsubscribeItems) unsubscribeItems();
    
    // Listen to shared items collection
    const itemsQuery = query(
        collection(db, `artifacts/${appId}/shared/items`),
        orderBy('createdAt', 'desc')
    );
    
    unsubscribeItems = onSnapshot(itemsQuery, (snapshot) => {
        allItems = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderItems();
        renderAllItemsList();
    });
}

// --- Rendering Functions ---
function filterItems() {
    const activeFilterTags = Object.values(activeFilters).flatMap(set => Array.from(set));
    if (activeFilterTags.length === 0) return allItems;
    
    return allItems.filter(item => {
        if (!item.tags) return false;
        return activeFilterTags.every(tag => item.tags.includes(tag));
    });
}

function renderItems() {
    const filteredItems = filterItems();
    
    if (filteredItems.length === 0) {
        resultsSection.classList.add('hidden');
        noResultsContainer.classList.remove('hidden');
        return;
    }
    
    resultsSection.classList.remove('hidden');
    noResultsContainer.classList.add('hidden');
    
    itemListEl.innerHTML = filteredItems.map(item => `
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
            <div class="flex justify-between items-start mb-3">
                <h3 class="text-xl font-semibold text-slate-900 dark:text-white">${item.name}</h3>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                    Added by ${item.createdByName || 'Unknown'}
                </div>
            </div>
            <div class="flex flex-wrap gap-2">
                ${item.tags.map(tag => `<span class="bg-violet-100 dark:bg-violet-900 text-violet-800 dark:text-violet-200 px-3 py-1 rounded-full text-sm">${tag}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

function renderAllItemsList() {
    allItemsListEl.innerHTML = allItems.map(item => `
        <div class="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <div class="flex-1">
                <h4 class="font-semibold text-slate-900 dark:text-white">${item.name}</h4>
                <div class="flex flex-wrap gap-1 mt-1">
                    ${item.tags.map(tag => `<span class="bg-violet-100 dark:bg-violet-900 text-violet-800 dark:text-violet-200 px-2 py-1 rounded-full text-xs">${tag}</span>`).join('')}
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Added by ${item.createdByName || 'Unknown'} on ${item.createdAt?.toDate().toLocaleDateString() || 'Unknown date'}
                </p>
            </div>
            <button class="delete-item-btn ml-4 text-red-500 hover:text-red-700 text-lg font-bold" data-item-id="${item.id}">&times;</button>
        </div>
    `).join('');
}

// --- Event Handlers ---
async function handleAddItem(e) {
    e.preventDefault();
    if (!currentUser) return;
    
    const name = itemNameInput.value.trim();
    if (!name || formSelectedTags.size === 0) return;
    
    const newItem = {
        name,
        tags: Array.from(formSelectedTags),
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        createdByEmail: currentUser.email,
        createdByName: currentUser.displayName || currentUser.email
    };
    
    try {
        await addDoc(collection(db, `artifacts/${appId}/shared/items`), newItem);
        itemNameInput.value = '';
        formSelectedTags.clear();
        initializeTagPickers();
    } catch (error) {
        console.error("Error adding item:", error);
        alert("Failed to add item: " + error.message);
    }
}

async function handleDeleteItem(itemId) {
    if (!currentUser) return;
    
    try {
        await deleteDoc(doc(db, `artifacts/${appId}/shared/items/${itemId}`));
    } catch (error) {
        console.error("Error deleting item:", error);
        alert("Failed to delete item: " + error.message);
    }
}

function handleGlobalClick(e) {
    // Handle tag clicks
    if (e.target.classList.contains('tag-chip')) {
        handleTagClick(e.target);
    }
    
    // Handle delete tag buttons
    if (e.target.classList.contains('delete-tag-btn')) {
        const groupName = e.target.dataset.group;
        const tag = e.target.dataset.tag;
        deleteExistingTag(groupName, tag);
    }
    
    // Handle delete item buttons
    if (e.target.classList.contains('delete-item-btn')) {
        const itemId = e.target.dataset.itemId;
        if (confirm('Are you sure you want to delete this place?')) {
            handleDeleteItem(itemId);
        }
    }
    
    // Handle add new tag forms
    if (e.target.closest('form') && e.target.type === 'submit' && e.target.closest('#manage-tags-section')) {
        e.preventDefault();
        const form = e.target.closest('form');
        const input = form.querySelector('input');
        const groupName = form.closest('div').querySelector('h4').textContent;
        const newTag = input.value.trim();
        if (newTag) {
            saveNewTag(groupName, newTag);
            input.value = '';
        }
    }
}

function handleTagClick(button) {
    const tag = button.dataset.tag;
    const context = button.dataset.context;
    const groupName = button.dataset.group;
    
    if (context === 'form') {
        if (formSelectedTags.has(tag)) {
            formSelectedTags.delete(tag);
            button.classList.remove('bg-violet-600', 'text-white', 'selected');
            button.classList.add('bg-slate-200', 'dark:bg-slate-600', 'text-slate-700', 'dark:text-slate-200');
        } else {
            formSelectedTags.add(tag);
            button.classList.add('bg-violet-600', 'text-white', 'selected');
            button.classList.remove('bg-slate-200', 'dark:bg-slate-600', 'text-slate-700', 'dark:text-slate-200');
        }
        
        // Show/hide cuisine group based on type selection
        if (groupName === 'Type') {
            const cuisineGroup = document.getElementById('form-cuisine-group');
            if (cuisineGroup) {
                if (tag === 'food' || tag === 'drink') {
                    cuisineGroup.classList.remove('hidden');
                } else {
                    cuisineGroup.classList.add('hidden');
                    // Remove cuisine tags from selection
                    TAG_GROUPS['Cuisine / Style'].tags.forEach(cuisineTag => {
                        formSelectedTags.delete(cuisineTag);
                    });
                    initializeTagPickers();
                }
            }
        }
    } else if (context === 'filter') {
        if (activeFilters[groupName].has(tag)) {
            activeFilters[groupName].delete(tag);
            button.classList.remove('bg-violet-600', 'text-white', 'selected');
            button.classList.add('bg-slate-200', 'dark:bg-slate-600', 'text-slate-700', 'dark:text-slate-200');
        } else {
            activeFilters[groupName].add(tag);
            button.classList.add('bg-violet-600', 'text-white', 'selected');
            button.classList.remove('bg-slate-200', 'dark:bg-slate-600', 'text-slate-700', 'dark:text-slate-200');
        }
        renderItems();
    }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    // Authentication listeners
    googleSigninBtn.addEventListener('click', signInWithGoogle);
    emailSigninForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!email || !password) return;
        
        // Try sign-in first, if it fails, try sign-up
        try {
            await signInWithEmail(email, password, false);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                await signInWithEmail(email, password, true);
            } else {
                throw error;
            }
        }
    });
    signoutBtn.addEventListener('click', signOutUser);
    
    // Existing app listeners
    addItemForm.addEventListener('submit', handleAddItem);
    document.addEventListener('click', handleGlobalClick);
    viewAllBtn.addEventListener('click', () => {
        viewAllSection.classList.remove('hidden');
        viewAllBtn.classList.add('hidden');
    });
    closeViewAllBtn.addEventListener('click', () => {
        viewAllSection.classList.add('hidden');
        viewAllBtn.classList.remove('hidden');
    });
} 