import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, doc, deleteDoc, updateDoc, setLogLevel } from 'firebase/firestore';
import firebaseConfig from './firebaseConfig.js';

// --- Helper Icon Components ---
const LoaderIcon = () => (
  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-gray-400 hover:text-red-500 transition-colors">
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
    </svg>
);

const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-gray-400 hover:text-blue-500 transition-colors">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        <path d="m15 5 4 4"/>
    </svg>
);


// --- Main Application Component ---
export default function App() {
    // --- State Management ---
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);

    const [prompts, setPrompts] = useState([]);
    const [newPrompt, setNewPrompt] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [editingPromptId, setEditingPromptId] = useState(null);
    const [editingPromptText, setEditingPromptText] = useState('');
    
    const isInitialized = useRef(false);

    // --- Firebase Initialization and Authentication ---
    useEffect(() => {
        if (isInitialized.current) return;
        isInitialized.current = true;

        try {
            if (typeof __firebase_config === 'undefined') {
                throw new Error("Firebase configuration object not found.");
            }
            
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            
            setLogLevel('debug');

            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                            await signInWithCustomToken(authInstance, __initial_auth_token);
                        } else {
                            await signInAnonymously(authInstance);
                        }
                    } catch (authError) {
                        console.error("Authentication failed:", authError);
                        setError("Failed to authenticate. Please refresh the page.");
                    }
                }
            });
            
            return () => unsubscribe();

        } catch (e) {
            console.error("Firebase initialization failed:", e);
            setError("Could not connect to the backend. Please check configuration.");
            setIsLoading(false);
        }
    }, []);

    // --- Firestore Data Fetching ---
    useEffect(() => {
        if (!db || !userId) {
            return;
        }

        setIsLoading(true);

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const collectionPath = `/artifacts/${appId}/users/${userId}/prompts`;
        const promptsCollection = collection(db, collectionPath);
        const q = query(promptsCollection);

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const promptsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            promptsData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
            setPrompts(promptsData);
            setIsLoading(false);
        }, (err) => {
            console.error("Error fetching prompts:", err);
            setError("Failed to load prompts. Please check permissions and network.");
            setIsLoading(false);
        });

        return () => {
            unsubscribe();
        };
    }, [db, userId]);

    // --- Firestore Actions ---
    const handleAddPrompt = async (e) => {
        e.preventDefault();
        if (!newPrompt.trim() || !db || !userId) return;

        setIsSubmitting(true);
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const collectionPath = `/artifacts/${appId}/users/${userId}/prompts`;
            await addDoc(collection(db, collectionPath), {
                text: newPrompt,
                createdAt: new Date(),
            });
            setNewPrompt('');
        } catch (err) {
            console.error("Error adding prompt:", err);
            setError("Failed to save prompt.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeletePrompt = async (promptId) => {
        if (!db || !userId || !promptId) return;
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const docPath = `/artifacts/${appId}/users/${userId}/prompts/${promptId}`;
            await deleteDoc(doc(db, docPath));
        } catch (err) {
            console.error("Error deleting prompt:", err);
            setError("Failed to delete prompt.");
        }
    };

    const handleUpdatePrompt = async (e) => {
        e.preventDefault();
        if (!editingPromptText.trim() || !db || !userId || !editingPromptId) return;
        
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const docPath = `/artifacts/${appId}/users/${userId}/prompts/${editingPromptId}`;
            await updateDoc(doc(db, docPath), {
                text: editingPromptText
            });
            setEditingPromptId(null);
            setEditingPromptText('');
        } catch (err) {
            console.error("Error updating prompt:", err);
            setError("Failed to update prompt.");
        }
    };
    
    const startEditing = (prompt) => {
        setEditingPromptId(prompt.id);
        setEditingPromptText(prompt.text);
    };

    // --- Render Logic ---
    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
                <div className="bg-red-800 border border-red-600 p-6 rounded-lg shadow-lg text-center">
                    <h2 className="text-2xl font-bold mb-2">An Error Occurred</h2>
                    <p>{error}</p>
                </div>
            </div>
        );
    }
    
    if (isLoading || !userId) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
                <LoaderIcon />
                <p className="mt-4 text-lg">Connecting to your workspace...</p>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-3xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-4xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                        My Prompt Library
                    </h1>
                    {userId && <p className="text-center text-gray-500 text-xs mt-2">User ID: {userId}</p>}
                </header>

                <div className="bg-gray-800 p-6 rounded-xl shadow-2xl mb-8">
                    <form onSubmit={handleAddPrompt}>
                        <textarea
                            value={newPrompt}
                            onChange={(e) => setNewPrompt(e.target.value)}
                            placeholder="Enter a new brilliant prompt..."
                            className="w-full p-4 bg-gray-900 border-2 border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none text-white placeholder-gray-500"
                            rows="4"
                            disabled={isSubmitting}
                        />
                        <button
                            type="submit"
                            disabled={isSubmitting || !newPrompt.trim()}
                            className="w-full mt-4 flex items-center justify-center bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
                        >
                            {isSubmitting ? <LoaderIcon /> : 'Add Prompt'}
                        </button>
                    </form>
                </div>

                <div className="space-y-4">
                    {prompts.map((prompt) => (
                        <div key={prompt.id} className="bg-gray-800 p-5 rounded-lg shadow-lg transition-all hover:bg-gray-700/50">
                             {editingPromptId === prompt.id ? (
                                <form onSubmit={handleUpdatePrompt} className="flex flex-col">
                                    <textarea
                                        value={editingPromptText}
                                        onChange={(e) => setEditingPromptText(e.target.value)}
                                        className="w-full p-3 bg-gray-900 border-2 border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none text-white"
                                        rows="3"
                                    />
                                    <div className="flex items-center justify-end mt-3 space-x-2">
                                        <button type="button" onClick={() => setEditingPromptId(null)} className="px-4 py-2 text-sm rounded-md bg-gray-600 hover:bg-gray-500">Cancel</button>
                                        <button type="submit" className="px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-700">Save</button>
                                    </div>
                                </form>
                            ) : (
                                <div className="flex justify-between items-start">
                                    <p className="whitespace-pre-wrap text-gray-300 flex-1 pr-4">{prompt.text}</p>
                                    <div className="flex items-center space-x-3 flex-shrink-0">
                                        <button onClick={() => startEditing(prompt)} aria-label="Edit prompt">
                                            <EditIcon />
                                        </button>
                                        <button onClick={() => handleDeletePrompt(prompt.id)} aria-label="Delete prompt">
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
