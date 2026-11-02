import { Routes,Route,Navigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { AppLayout } from './layouts/AppLayout';
import { PeriodProvider } from './PeriodContext';
import { OverviewPage } from '../features/dashboard/OverviewPage';
import { EmployeesPage } from '../features/employees/EmployeesPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { PayrollPage } from '../features/payroll/PayrollPage';
import { SettingsPage } from '../features/settings/SettingsPage';
export function App(){const {demo,user,admin,loading,logout}=useAuth();
 if(loading)return <p className="p-10">Checking administrator access…</p>;
 if(!demo&&!user)return <LoginPage/>;
 if(!demo&&!admin)return <div className="card m-10"><h1>Access not granted</h1><p>This account does not have administrator permission.</p><button className="button mt-4" onClick={logout}>Sign out</button></div>;
 return <PeriodProvider><Routes><Route element={<AppLayout/>}><Route index element={<OverviewPage/>}/><Route path="employees" element={<EmployeesPage/>}/><Route path="attendance" element={<AttendancePage/>}/><Route path="payroll" element={<PayrollPage/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Route></Routes></PeriodProvider>
}
