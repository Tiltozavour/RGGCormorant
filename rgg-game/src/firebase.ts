import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAooKu3en7NMs-Hhlsl_Np432NVYOgIE8E",
  authDomain: "rggcormarant.firebaseapp.com",
  projectId: "rggcormarant",
  storageBucket: "rggcormarant.firebasestorage.app",
  messagingSenderId: "542738594296",
  appId: "1:542738594296:web:327d4527fcb5ce6096be0d"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);