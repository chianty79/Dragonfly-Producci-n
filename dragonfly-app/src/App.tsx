import { AppProvider, useApp } from './context/AppContext';
import { LoginScreen } from './screens/LoginScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import AdminScreen from './screens/AdminScreen';
import OperatorScreen from './screens/OperatorScreen';
import NewOrderScreen from './screens/NewOrderScreen';
import ProjectDetailScreen from './screens/ProjectDetailScreen';
import EditProjectScreen from './screens/EditProjectScreen';
import BoardSpecScreen from './screens/BoardSpecScreen';
import MaterialsScreen from './screens/MaterialsScreen';

function AppRouter() {
  const { currentScreen, authLoading } = useApp();

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '32px' }}>🏄</div>
        <div style={{ color: '#64748b', fontSize: '14px' }}>Cargando...</div>
      </div>
    );
  }

  switch (currentScreen) {
    case 'login': return <LoginScreen />;
    case 'register': return <RegisterScreen />;
    case 'admin': return <AdminScreen />;
    case 'operator': return <OperatorScreen />;
    case 'new-order': return <NewOrderScreen />;
    case 'project-detail': return <ProjectDetailScreen />;
    case 'edit-project': return <EditProjectScreen />;
    case 'board-spec': return <BoardSpecScreen />;
    case 'materials': return <MaterialsScreen />;
    default: return <LoginScreen />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  );
}
