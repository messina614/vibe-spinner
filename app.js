import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup,
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
    "Cuisine / Style": { tags: ["italian", "mexican", "sushi", "cafe", "cocktails", "brewery"], logic: "OR", condition: { group: "Type", values: ["food", "drink"] } },
    "Tag": { tags: ["cozy", "lively", "fancy", "casual", "outdoor", "quick", "coffee"], logic: "OR" }
};

// --- App State ---
let db, auth, currentUser, unsubscribeItems;
let TAG_GROUPS = JSON.parse(JSON.stringify(DEFAULT_TAG_GROUPS));
let allItems = [];
let formSelectedTags = new Set();
let editFormSelectedTags = new Set();
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

const editItemModal = document.getElementById('edit-item-modal');
const editItemForm = document.getElementById('edit-item-form');
const editItemIdInput = document.getElementById('edit-item-id');
const editItemNameInput = document.getElementById('edit-item-name');
const editFormTagGroupsEl = document.getElementById('edit-form-tag-groups');
const editModalCloseBtn = document.getElementById('edit-modal-close-btn');
const editModalCancelBtn = document.getElementById('edit-modal-cancel-btn');


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
        
        // Set up auth listener
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
        
        // Handle any pending redirect result
        handleRedirectResult();
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
        console.log('Attempting Google sign-in with popup...');
        
        try {
            await signInWithPopup(auth, provider);
            console.log('Popup sign-in successful');
        } catch (popupError) {
            console.log('Popup failed, trying redirect:', popupError);
            
            // If popup fails, try redirect
            if (popupError.code === 'auth/popup-closed-by-user' || 
                popupError.message.includes('Cross-Origin-Opener-Policy') ||
                popupError.code === 'auth/popup-blocked') {
                
                console.log('Falling back to redirect...');
                await signInWithRedirect(auth, provider);
            } else {
                throw popupError;
            }
        }
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
    
    // CORRECTED PATH: Use a simpler, valid path.
    const tagsDocRef = doc(db, 'data', appId);
    const docSnap = await getDoc(tagsDocRef);
    
    if (docSnap.exists() && docSnap.data().groups) {
        TAG_GROUPS = docSnap.data().groups;
    } else {
        // Initialize shared tags if they don't exist
        await setDoc(tagsDocRef, { 
            groups: DEFAULT_TAG_GROUPS,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp()
        }, { merge: true }); // Use merge to avoid overwriting other potential fields
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
        // CORRECTED PATH
        const itemRef = doc(db, 'data', appId, 'items', item.id);
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
    
    // CORRECTED PATH
    const tagsDocRef = doc(db, 'data', appId);
    await setDoc(tagsDocRef, { 
        groups: TAG_GROUPS,
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp()
    }, { merge: true }); // Use merge to avoid overwriting other potential fields
}

function initializeTagPickers() {
    formTagGroupsEl.innerHTML = '';
    filterTagGroupsEl.innerHTML = '';

    const groupOrder = ["Type", "Cuisine / Style", "Tag"];

    for (const groupName of groupOrder) {
        const groupData = TAG_GROUPS[groupName];
        if (groupData) {
            // For the form, create all groups
            formTagGroupsEl.appendChild(createTagGroup(groupName, groupData.tags, 'form'));

            // For filter bar, only show groups without a 'condition'
            if (!groupData.condition) {
                filterTagGroupsEl.appendChild(createTagGroup(groupName, groupData.tags, 'filter'));
            }
        }
    }

    updateConditionalTagGroups();
}

function createTagGroup(name, tags, context) {
    const groupElement = document.createElement('div');
    if (TAG_GROUPS[name].condition) {
        groupElement.classList.add('conditional-group', 'hidden');
        groupElement.id = `${context}-${name.replace(/ \/ /g, '-')}-group`;
    }

    groupElement.innerHTML = `<h4 class="block text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">${name}</h4>`;
    
    const tagContainer = document.createElement('div');
    tagContainer.className = 'flex flex-wrap gap-2 items-center';
    tags.forEach(tag => tagContainer.appendChild(createTagChip(tag, context, name)));
    
    groupElement.appendChild(tagContainer);
    return groupElement;
}

function createTagChip(tag, context, groupName) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tag;
    button.dataset.tag = tag;
    button.dataset.context = context;
    button.dataset.group = groupName; // Add group name to button
    
    button.addEventListener('click', () => handleTagClick(button));

    let isSelected;
    if (context === 'form') {
        isSelected = formSelectedTags.has(tag);
    } else if (context === 'edit') {
        isSelected = editFormSelectedTags.has(tag);
    } else { // filter
        isSelected = activeFilters[groupName] && activeFilters[groupName].includes(tag);
    }

    if (isSelected) {
        button.classList.add('selected');
    }
    
    button.className = `tag-chip px-4 py-2 text-base font-medium rounded-full cursor-pointer ${button.classList.contains('selected') ? 'bg-violet-600 text-white selected' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`;
    return button;
}

function renderTagManagementUI() {
    manageTagsSection.innerHTML = '';
    const groupOrder = ["Cuisine / Style", "Tag"];
    groupOrder.forEach(groupName => {
        if (TAG_GROUPS[groupName]) {
            const groupDiv = document.createElement('div');
            groupDiv.innerHTML = `<h4 class="text-xl font-semibold text-slate-800 mb-2">${groupName}</h4>`;

            const tagList = document.createElement('div');
            tagList.className = 'flex flex-wrap gap-2 mb-3';
            TAG_GROUPS[groupName].tags.forEach(tag => {
                const tagEl = document.createElement('div');
                tagEl.className = 'relative group';
                tagEl.innerHTML = `
                    <span class="bg-slate-200 text-base px-4 py-2 rounded-full block">${tag}</span>
                    <button class="delete-tag-btn absolute -top-1.5 -right-1.5 bg-slate-400 text-white rounded-full w-5 h-5 text-xs leading-none hidden group-hover:flex items-center justify-center transition-colors hover:bg-red-500" data-group="${groupName}" data-tag="${tag}">&times;</button>
                `;
                tagList.appendChild(tagEl);
            });
            groupDiv.appendChild(tagList);

            const addForm = document.createElement('form');
            addForm.className = 'flex gap-2 items-center';
            addForm.innerHTML = `
                <input type="text" placeholder="Add new ${groupName.toLowerCase()}" class="flex-1 px-3 py-2 text-base bg-slate-100 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition">
                <button type="submit" class="bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 transition">Add</button>
            `;
            groupDiv.appendChild(addForm);
            manageTagsSection.appendChild(groupDiv);
        }
    });
}

// --- Firestore Listener (Updated for shared collections) ---
function setupFirestoreListener() {
    if (!currentUser || unsubscribeItems) return;

    const itemsCol = collection(db, 'data', appId, 'items');
    const q = query(itemsCol, orderBy('createdAt', 'desc'));

    unsubscribeItems = onSnapshot(q, (snapshot) => {
        allItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Firestore listener updated: ${allItems.length} items loaded.`);
        renderItems();
        renderAllItemsList();
    }, (error) => {
        console.error("Error with Firestore listener:", error);
    });
}

// --- Rendering Functions ---
function filterItems() {
    const activeGroups = Object.keys(activeFilters).filter(group => activeFilters[group].length > 0);

    if (activeGroups.length === 0) {
        return []; // Return empty array if no filters are active at all.
    }

    return allItems.filter(item => {
        if (!item.tags || item.tags.length === 0) return false;
        const itemTags = new Set(item.tags);

        // Check each group with active filters
        return activeGroups.every(groupName => {
            const groupFilters = activeFilters[groupName]; // this is an array of tags
            if (!groupFilters || groupFilters.length === 0) return true;

            const groupLogic = TAG_GROUPS[groupName]?.logic || "OR";

            if (groupLogic === "OR") {
                // Item must have at least one of the selected tags in this group
                return groupFilters.some(tag => itemTags.has(tag));
            } else { // AND logic
                // Item must have all of the selected tags in this group
                return groupFilters.every(tag => itemTags.has(tag));
            }
        });
    });
}

function renderItems() {
    const activeFilterCount = Object.values(activeFilters).reduce((count, tags) => count + tags.length, 0);

    if (activeFilterCount === 0) {
        resultsSection.classList.add('hidden');
        itemListEl.innerHTML = '';
        noResultsContainer.classList.add('hidden');
        return;
    }

    const filteredItems = filterItems();
    
    resultsSection.classList.remove('hidden');

    if (filteredItems.length === 0) {
        noResultsContainer.classList.remove('hidden');
        itemListEl.innerHTML = '';
    } else {
        noResultsContainer.classList.add('hidden');
        itemListEl.innerHTML = filteredItems.map(item => `
            <div class="list-item bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-xl font-semibold text-slate-900">${item.name}</h3>
                    <p class="text-xs text-slate-400 text-right">Added by:<br>${item.createdByName || 'unknown'}</p>
                </div>
                <div class="flex flex-wrap gap-2 mt-2">
                    ${(item.tags || []).map(tag => `<span class="bg-violet-100 text-violet-800 px-3 py-1 rounded-full text-sm">${tag}</span>`).join('')}
                </div>
            </div>
        `).join('');
    }
}

function renderAllItemsList() {
    allItemsListEl.innerHTML = allItems.map(item => `
        <div class="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
            <div class="flex-1">
                <h4 class="font-semibold text-slate-900">${item.name}</h4>
                <div class="flex flex-wrap gap-1 mt-1">
                    ${(item.tags || []).map(tag => `<span class="bg-violet-100 text-violet-800 px-2 py-1 rounded-full text-xs">${tag}</span>`).join('')}
                </div>
                <p class="text-xs text-slate-500 mt-1">
                    Added by ${item.createdByName || 'Unknown'} on ${item.createdAt?.toDate().toLocaleDateString() || 'Unknown date'}
                </p>
            </div>
            <div class="flex items-center gap-3">
                <button class="edit-item-btn text-sm font-medium text-slate-600 hover:text-violet-600 p-2" data-item-id="${item.id}">Edit</button>
                <button class="delete-item-btn text-lg font-bold text-red-500 hover:text-red-700 w-6 h-6" data-item-id="${item.id}">&times;</button>
            </div>
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
        // CORRECTED PATH
        await addDoc(collection(db, 'data', appId, 'items'), newItem);
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
        // CORRECTED PATH
        await deleteDoc(doc(db, 'data', appId, 'items', itemId));
    } catch (error) {
        console.error("Error deleting item:", error);
        alert("Failed to delete item: " + error.message);
    }
}

function handleGlobalClick(e) {
    // Modal closing logic for "All Places"
    if (!viewAllSection.classList.contains('hidden')) {
        const managementContainer = viewAllSection.querySelector('.bg-white');
        if (managementContainer && !managementContainer.contains(e.target) && !viewAllBtn.contains(e.target)) {
            viewAllSection.classList.add('hidden');
            viewAllBtn.classList.remove('hidden');
        }
    }
    
    // Handle delete tag buttons
    if (e.target.classList.contains('delete-tag-btn')) {
        const groupName = e.target.dataset.group;
        const tag = e.target.dataset.tag;
        deleteExistingTag(groupName, tag);
    }
    
    // Handle delete item buttons
    if (e.target.classList.contains('delete-item-btn')) {
        const button = e.target;
        const itemId = button.dataset.itemId;
        if (button.classList.contains('confirm-delete')) {
            handleDeleteItem(itemId);
        } else {
            // First click, add confirmation class and text
            button.classList.add('confirm-delete');
            button.textContent = 'Sure?';
            // Set timeout to revert button state
            setTimeout(() => {
                if (button.classList.contains('confirm-delete')) {
                    button.classList.remove('confirm-delete');
                    button.innerHTML = '&times;';
                }
            }, 3000); // 3 seconds to confirm
        }
    }

    if (e.target.classList.contains('edit-item-btn')) {
        const itemId = e.target.dataset.itemId;
        openEditModal(itemId);
    }

    // Reset other delete buttons
    document.querySelectorAll('.delete-item-btn.confirm-delete').forEach(btn => {
        if (btn !== e.target) {
            btn.classList.remove('confirm-delete');
            btn.innerHTML = '&times;';
        }
    });

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

function updateConditionalTagGroups(context = 'form') {
    const selectedTags = context === 'edit' ? editFormSelectedTags : formSelectedTags;
    const cuisineGroup = document.getElementById(`${context}-Cuisine-Style-group`);
    
    if (!cuisineGroup) return;

    const isFoodOrDrinkSelected = selectedTags.has('food') || selectedTags.has('drink');

    if (isFoodOrDrinkSelected) {
        cuisineGroup.classList.remove('hidden');
    } else {
        cuisineGroup.classList.add('hidden');
        // Also deselect any cuisine tags if the parent condition is no longer met
        TAG_GROUPS['Cuisine / Style'].tags.forEach(tag => {
            if (selectedTags.has(tag)) {
                selectedTags.delete(tag);
                const tagButton = (context === 'edit' ? editFormTagGroupsEl : formTagGroupsEl).querySelector(`[data-tag="${tag}"]`);
                if (tagButton) {
                    tagButton.classList.remove('selected');
                }
            }
        });
    }
}

function handleTagClick(button) {
    const tag = button.textContent;
    const groupName = button.dataset.group;
    const context = button.dataset.context;

    let targetSet;
    if (context === 'form') {
        targetSet = formSelectedTags;
    } else if (context === 'edit') {
        targetSet = editFormSelectedTags;
    }

    if (targetSet) { // logic for form and edit contexts
        const isSelected = button.classList.contains('selected');
        if (isSelected) {
            targetSet.delete(tag);
            button.classList.remove('selected');
        } else {
            targetSet.add(tag);
            button.classList.add('selected');
        }
        updateConditionalTagGroups(context);
    } else { // context === 'filter'
        const isSelected = button.classList.contains('selected');

        if (!activeFilters[groupName]) {
            activeFilters[groupName] = [];
        }
        
        const currentGroupFilters = activeFilters[groupName];
        const groupLogic = TAG_GROUPS[groupName]?.logic || 'OR';

        if (isSelected) {
            // Deselect
            button.classList.remove('selected');
            const index = currentGroupFilters.indexOf(tag);
            if (index > -1) {
                currentGroupFilters.splice(index, 1);
            }
        } else {
            // Select
            if (groupLogic === 'OR') {
                // For OR logic, we allow only one selection per group in the filter.
                // Deselect other tags in the same group first.
                const groupButtons = filterTagGroupsEl.querySelectorAll(`[data-group="${groupName}"].selected`);
                groupButtons.forEach(btn => {
                    btn.classList.remove('selected');
                });
                activeFilters[groupName] = [];
            }
            button.classList.add('selected');
            activeFilters[groupName].push(tag);
        }
    }

    if (context === 'filter') {
        renderItems();
    }
}

// --- Edit Modal Functions ---
function openEditModal(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    editItemIdInput.value = item.id;
    editItemNameInput.value = item.name;
    editFormSelectedTags = new Set(item.tags || []);
    
    // Render tags for the edit form
    editFormTagGroupsEl.innerHTML = '';
    const groupOrder = ["Type", "Cuisine / Style", "Tag"];
    for (const groupName of groupOrder) {
        const groupData = TAG_GROUPS[groupName];
        if (groupData) {
            editFormTagGroupsEl.appendChild(createTagGroup(groupName, groupData.tags, 'edit'));
        }
    }
    
    updateConditionalTagGroups('edit');
    editItemModal.classList.remove('hidden');
}

function closeEditModal() {
    editItemModal.classList.add('hidden');
}

async function handleEditItemSubmit(e) {
    e.preventDefault();
    const itemId = editItemIdInput.value;
    const newName = editItemNameInput.value.trim();
    if (!itemId || !newName) return;

    const updatedData = {
        name: newName,
        tags: Array.from(editFormSelectedTags),
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp()
    };

    try {
        const itemRef = doc(db, 'data', appId, 'items', itemId);
        await updateDoc(itemRef, updatedData);
        closeEditModal();
    } catch (error) {
        console.error("Error updating item:", error);
        alert("Failed to update item: " + error.message);
    }
}


// --- Event Listeners Setup ---
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Check if all required elements exist
    const requiredElements = {
        googleSigninBtn,
        emailSigninForm,
        emailInput,
        passwordInput,
        signoutBtn,
        addItemForm,
        loadingEl,
        loginSection,
        mainContentEl,
        userInfoSection
    };
    
    console.log('Required elements check:');
    Object.entries(requiredElements).forEach(([name, element]) => {
        console.log(`${name}:`, element ? 'Found' : 'NOT FOUND');
    });
    
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

    // Edit Modal Listeners
    editItemForm.addEventListener('submit', handleEditItemSubmit);
    editModalCloseBtn.addEventListener('click', closeEditModal);
    editModalCancelBtn.addEventListener('click', closeEditModal);
} 