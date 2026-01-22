/**
 * Devices Page - List and manage user devices
 */

import { useQuery } from '@apollo/client';
import { Smartphone, Monitor, Tablet, Circle } from 'lucide-react';
import ContentWrapper from '../components/layout/ContentWrapper';
import Card, { CardHeader, CardBody } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { DEVICES_QUERY } from '../graphql/queries';

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  WINDOWS: <Monitor className="w-6 h-6" />,
  MACOS: <Monitor className="w-6 h-6" />,
  LINUX: <Monitor className="w-6 h-6" />,
  IOS: <Smartphone className="w-6 h-6" />,
  ANDROID: <Smartphone className="w-6 h-6" />,
  BROWSER: <Monitor className="w-6 h-6" />,
  GATEWAY: <Tablet className="w-6 h-6" />,
};

export default function Devices() {
  const { data, loading, error } = useQuery(DEVICES_QUERY);

  const devices = data?.devices || [];

  return (
    <ContentWrapper>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Devices</h1>
            <p className="text-gray-400">
              Manage devices connected to your ankrshield account
            </p>
          </div>
        </div>

        {/* Devices List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Your Devices</h2>
              <Badge variant="info">{devices.length} devices</Badge>
            </div>
          </CardHeader>
          <CardBody>
            {loading ? (
              <p className="text-gray-400">Loading devices...</p>
            ) : error ? (
              <Alert variant="error">
                Failed to load devices: {error.message}
              </Alert>
            ) : devices.length === 0 ? (
              <Alert variant="info">
                No devices connected yet. Install an ankrshield client app on your device to get started.
              </Alert>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device: any) => (
                    <TableRow key={device.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="text-gray-400">
                            {DEVICE_ICONS[device.deviceType] || <Smartphone className="w-6 h-6" />}
                          </div>
                          <div>
                            <p className="font-medium">{device.name}</p>
                            {device.osVersion && (
                              <p className="text-sm text-gray-400">{device.osVersion}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">{device.deviceType}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Circle
                            className={`w-3 h-3 ${
                              device.isActive ? 'fill-green-500 text-green-500' : 'fill-gray-500 text-gray-500'
                            }`}
                          />
                          <span className={device.isActive ? 'text-green-400' : 'text-gray-500'}>
                            {device.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {new Date(device.lastSeenAt).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-400">
                          {device.appVersion || 'N/A'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </ContentWrapper>
  );
}
