import { type ReactNode } from 'react';
import { NavigationContext, useNavigationProvider } from '../hooks/useKeyboardNavigation';

interface NavigationProviderProps {
  children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
  const navigation = useNavigationProvider();

  return (
    <NavigationContext.Provider value={navigation}>
      {children}
    </NavigationContext.Provider>
  );
}