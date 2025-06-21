import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, onSnapshot, deleteDoc, serverTimestamp, query, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const DEFAULT_TAG_GROUPS = {
    "Type": { tags: ["food", "drink", "place"], logic: "OR" },
    "Cuisine / Style": { tags: ["italian", "mexican", "sushi", "cafe", "cocktails", "brewery"], logic: "OR" },
    "Tag": { tags: ["cozy", "lively", "fancy", "casual", "outdoor", "quick", "coffee"], logic: "OR" }
};

// --- App State ---
let db, auth, userId, unsubscribeItems;
let TAG_GROUPS = JSON.parse(JSON.stringify(DEFAULT_TAG_GROUPS));
let allItems = [];
let formSelectedTags = new Set();
let activeFilters = {};

// --- DOM Elements ---
const loadingEl = document.getElementById('loading');
const mainContentEl = document.getElementById('main-content');
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
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = userId;
                await loadTags();
                setupFirestoreListener();
            } else {
                try {
                    if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
                    else await signInAnonymously(auth);
                } catch (error) { console.error("Authentication failed:", error); }
            }
        });
    } catch (error) { console.error("Firebase initialization failed:", error); }
}

// --- Tag Management ---
async function loadTags() {
    if (!userId) return;
    const tagsDocRef = doc(db, `artifacts/${appId}/users/${userId}/config/tags`);
    const docSnap = await getDoc(tagsDocRef);
    if (docSnap.exists() && docSnap.data().groups) {
        TAG_GROUPS = docSnap.data().groups;
    } else {
        await setDoc(tagsDocRef, { groups: DEFAULT_TAG_GROUPS });
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
        const itemRef = doc(db, `artifacts/${appId}/users/${userId}/items/${item.id}`);
        const newTags = item.tags.filter(t => t !== tagToDelete);
        return updateDoc(itemRef, { tags: newTags });
    });
    await Promise.all(promises);
}

async function updateTagConfigInFirestore() {
    if (!userId) return;
    const tagsDocRef = doc(db, `artifacts/${appId}/users/${userId}/config/tags`);
    await setDoc(tagsDocRef, { groups: TAG_GROUPS });
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
                <input type="text" placeholder="Add new ${groupName.toLowerCase()}" class="w-full px-4 py-3 text-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition">
                <button type="submit" data-group="${groupName}" class="add-tag-btn bg-violet-500 text-white font-bold rounded-lg w-10 h-10 flex-shrink-0 hover:bg-violet-600 text-xl">+</button>
            `;
            groupDiv.appendChild(addForm);
            manageTagsSection.appendChild(groupDiv);
        }
    });
}

// --- Data & Rendering ---
function setupFirestoreListener() {
    if (!userId) return;
    if (unsubscribeItems) unsubscribeItems();
    const itemsPath = `artifacts/${appId}/users/${userId}/items`;
    const q = query(collection(db, itemsPath));
    unsubscribeItems = onSnapshot(q, (snapshot) => {
        allItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allItems.sort((a, b) => a.name.localeCompare(b.name));
        renderItems();
        renderAllItemsList();
        loadingEl.style.display = 'none';
        mainContentEl.classList.remove('hidden');
    });
}

function renderItems() {
    const hasActiveFilters = Object.values(activeFilters).some(filterSet => filterSet.size > 0);
    if (!hasActiveFilters) {
        resultsSection.classList.add('hidden');
        return;
    }
    resultsSection.classList.remove('hidden');
    itemListEl.innerHTML = '';
    
    const filteredItems = allItems.filter(item => {
        if (!item.tags || item.tags.length === 0) return false;
        return Object.entries(activeFilters).every(([groupName, filterSet]) => {
            if (filterSet.size === 0) return true;
            return Array.from(filterSet).some(filterTag => item.tags.includes(filterTag));
        });
    });
    
    noResultsContainer.classList.toggle('hidden', filteredItems.length > 0);

    filteredItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'list-item bg-white dark:bg-slate-800 p-4 rounded-lg shadow-md';
        const tagsHTML = (item.tags || []).map(tag => `<span class="bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200 text-sm font-semibold mr-2 px-2.5 py-0.5 rounded-full">${tag}</span>`).join(' ');
        itemDiv.innerHTML = `
            <div>
                <p class="font-bold text-xl text-slate-800 dark:text-slate-100">${item.name}</p>
                <div class="mt-2 flex flex-wrap gap-2">${tagsHTML}</div>
            </div>`;
        itemListEl.appendChild(itemDiv);
    });
}

function renderAllItemsList() {
    allItemsListEl.innerHTML = '';
    if (allItems.length === 0) {
        allItemsListEl.innerHTML = `<p class="text-slate-500 dark:text-slate-400">Your list is empty.</p>`;
        return;
    }
    allItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700';
        itemDiv.innerHTML = `
            <span class="text-slate-800 dark:text-slate-200">${item.name}</span>
            <button data-id="${item.id}" class="delete-btn text-slate-400 hover:text-red-500 font-bold text-2xl leading-none px-2 transition-colors">&times;</button>
        `;
        allItemsListEl.appendChild(itemDiv);
    });
}

// --- Event Handlers ---
function setupEventListeners() {
    addItemForm.addEventListener('submit', handleAddItem);
    document.body.addEventListener('click', handleGlobalClick);
    viewAllBtn.addEventListener('click', () => viewAllSection.classList.remove('hidden'));
    closeViewAllBtn.addEventListener('click', () => {
        viewAllSection.classList.add('hidden');
        document.querySelectorAll('.confirm-delete').forEach(btn => btn.classList.remove('confirm-delete'));
    });
}

async function handleAddItem(e) {
    e.preventDefault();
    const name = itemNameInput.value.trim();
    if (!name || !userId) return;

    try {
        const itemsPath = `artifacts/${appId}/users/${userId}/items`;
        await addDoc(collection(db, itemsPath), { name, tags: Array.from(formSelectedTags), createdAt: serverTimestamp() });
        itemNameInput.value = '';
        formSelectedTags.clear();
        initializeAllUI();
        document.getElementById('form-cuisine-group').classList.add('hidden');
        itemNameInput.focus();
    } catch (error) { console.error("Error adding document: ", error); }
}

function handleGlobalClick(e) {
    const target = e.target;
    const armedButton = document.querySelector('.confirm-delete');
    
    if (armedButton && !armedButton.contains(target) && armedButton !== target) {
         armedButton.classList.remove('confirm-delete');
    }

    if (target.matches('.delete-btn') || target.matches('.delete-tag-btn')) {
        if (target.classList.contains('confirm-delete')) {
            if (target.matches('.delete-btn')) {
                 const itemId = target.dataset.id;
                 deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/items/${itemId}`));
            }
            if (target.matches('.delete-tag-btn')) {
                const groupName = target.dataset.group;
                const tagToDelete = target.dataset.tag;
                deleteExistingTag(groupName, tagToDelete);
            }
        } else {
            target.classList.add('confirm-delete');
        }
    } else if (target.matches('.tag-chip')) {
        handleTagClick(target);
    } else if (target.matches('.add-tag-btn')) {
        e.preventDefault();
        handleAddNewTag(target);
    }
}

function handleTagClick(button) {
    const tag = button.dataset.tag;
    const context = button.dataset.context;
    const groupName = button.dataset.group;
    
    button.classList.toggle('selected');
    button.classList.toggle('bg-violet-600');
    button.classList.toggle('text-white');
    button.classList.toggle('bg-slate-200');
    button.classList.toggle('dark:bg-slate-600');
    
    if (context === 'form') {
         if (formSelectedTags.has(tag)) formSelectedTags.delete(tag);
         else formSelectedTags.add(tag);
    } else {
        if (activeFilters[groupName].has(tag)) activeFilters[groupName].delete(tag);
        else activeFilters[groupName].add(tag);
    }

    if (tag === 'food') {
        const cuisineGroup = document.getElementById(`${context}-cuisine-group`);
        const isFoodSelected = context === 'form' ? formSelectedTags.has('food') : activeFilters['Type'].has('food');
        cuisineGroup.classList.toggle('hidden', !isFoodSelected);
        
        if (!isFoodSelected) {
             TAG_GROUPS['Cuisine / Style'].tags.forEach(cuisineTag => {
                const targetSet = context === 'form' ? formSelectedTags : activeFilters['Cuisine / Style'];
                if (targetSet.has(cuisineTag)) {
                    targetSet.delete(cuisineTag);
                    const chip = document.querySelector(`[data-context='${context}'][data-tag='${cuisineTag}']`);
                    if (chip) {
                        chip.classList.remove('selected', 'bg-violet-600', 'text-white');
                        chip.classList.add('bg-slate-200', 'dark:bg-slate-600');
                    }
                }
            });
        }
    }
    if (context === 'filter') renderItems();
}

function handleAddNewTag(button) {
    const groupName = button.dataset.group;
    const input = button.previousElementSibling;
    const newTag = input.value;
    if (newTag) {
        saveNewTag(groupName, newTag);
        input.value = '';
    }
} 