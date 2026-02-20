/**
 * ankrshield Mobile App
 * React Native Application for iOS
 */

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActivityScreen } from './src/screens/ActivityScreen';
import { AgentManagerScreen } from './src/screens/AgentManagerScreen';
import { AndroidMonitorScreen } from './src/screens/AndroidMonitorScreen';
import { ConferenceScreen } from './src/screens/ConferenceScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { FeatureRequestScreen } from './src/screens/FeatureRequestScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LiveThreatsScreen } from './src/screens/LiveThreatsScreen';
import { RiskLookupScreen } from './src/screens/RiskLookupScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SpywareScanScreen } from './src/screens/SpywareScanScreen';
import { ThreatAlertsScreen } from './src/screens/ThreatAlertsScreen';
import { WarriorScreen } from './src/screens/WarriorScreen';
import { WhatsAppGuardScreen } from './src/screens/WhatsAppGuardScreen';

const Stack = createNativeStackNavigator();

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#1a1a1a',
            },
            headerTintColor: '#4CAF50',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            contentStyle: {
              backgroundColor: '#121212',
            },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'ankrshield' }} />
          <Stack.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ title: 'Dashboard' }}
          />
          <Stack.Screen
            name="Activity"
            component={ActivityScreen}
            options={{ title: 'Recent Activity' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings' }}
          />
          <Stack.Screen
            name="Warrior"
            component={WarriorScreen}
            options={{ title: 'AI Warrior' }}
          />
          <Stack.Screen
            name="ThreatAlerts"
            component={ThreatAlertsScreen}
            options={{ title: 'Threat Alerts' }}
          />
          <Stack.Screen
            name="AgentManager"
            component={AgentManagerScreen}
            options={{ title: 'Agent Manager' }}
          />
          <Stack.Screen
            name="SpywareScan"
            component={SpywareScanScreen}
            options={{ title: 'Spyware Scan' }}
          />
          <Stack.Screen
            name="LiveThreats"
            component={LiveThreatsScreen}
            options={{
              title: 'Live Threats',
              headerStyle: { backgroundColor: '#0f172a' },
              headerTintColor: '#ef4444',
            }}
          />
          <Stack.Screen
            name="AndroidMonitor"
            component={AndroidMonitorScreen}
            options={{ title: 'App Scanner' }}
          />
          <Stack.Screen
            name="Conference"
            component={ConferenceScreen}
            options={{
              title: '🎤 Join Conference',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#3b82f6',
            }}
          />
          <Stack.Screen
            name="RiskLookup"
            component={RiskLookupScreen}
            options={{
              title: '🔍 Risk Lookup',
              headerStyle: { backgroundColor: '#080c14' },
              headerTintColor: '#60a5fa',
            }}
          />
          <Stack.Screen
            name="Help"
            component={HelpScreen}
            options={{
              title: '❓ Help & Guide',
              headerStyle: { backgroundColor: '#0c1118' },
              headerTintColor: '#22d3ee',
            }}
          />
          <Stack.Screen
            name="FeatureRequest"
            component={FeatureRequestScreen}
            options={{
              title: '💡 Feature Request',
              headerStyle: { backgroundColor: '#0c1118' },
              headerTintColor: '#3b82f6',
            }}
          />
          <Stack.Screen
            name="WhatsAppGuard"
            component={WhatsAppGuardScreen}
            options={{
              title: '💬 WhatsApp Guard',
              headerStyle: { backgroundColor: '#0c1118' },
              headerTintColor: '#25d366',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
