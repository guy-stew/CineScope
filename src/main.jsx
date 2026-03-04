import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider, SignedIn, SignedOut, SignIn } from '@clerk/react'
import App from './App'

// Bootstrap CSS
import 'bootstrap/dist/css/bootstrap.min.css'

// Leaflet CSS
import 'leaflet/dist/leaflet.css'

// App styles
import './index.css'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkPubKey}>
      <SignedIn>
        <App />
      </SignedIn>
      <SignedOut>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: '#1A365D'
        }}>
          <SignIn />
        </div>
      </SignedOut>
    </ClerkProvider>
  </React.StrictMode>
)
