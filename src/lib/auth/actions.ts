'use server';

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase';
import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = '__session';

export async function getUserRole(uid: string): Promise<'admin' | 'operator' | null> {
  try {
    const userDocRef = doc(firestore, 'users', uid);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      return docSnap.data()?.role || null;
    }
    return null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

export async function signInWithEmail({ email, password }: { email: string; password: string }) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await userCredential.user.getIdToken();

    cookies().set(SESSION_COOKIE_NAME, idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return { success: true, error: null };
  } catch (error: any) {
    // Return the specific Firebase error code/message
    return { success: false, error: error.code || error.message };
  }
}

export async function signOut() {
  try {
    await firebaseSignOut(auth);
    cookies().delete(SESSION_COOKIE_NAME);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// NOTE: This is a utility function for seeding users, not a standard action
export async function seedUser(email: string, password: string, role: 'admin' | 'operator') {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        const userDocRef = doc(firestore, 'users', user.uid);
        await setDoc(userDocRef, { role });

        return { success: true, uid: user.uid };
    } catch (error: any) {
        if(error.code === 'auth/email-already-in-use') {
            return { success: false, error: 'Email already exists.'}
        }
        return { success: false, error: error.message };
    }
}
