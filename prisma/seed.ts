/**
 * Seed script for ankrshield database
 * Run with: pnpm prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// Helper to hash passwords (simple for demo - use bcrypt in production)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data (in development only!)
  console.log('🗑️  Cleaning existing data...');
  await prisma.aIActivity.deleteMany();
  await prisma.networkEvent.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.dailyStats.deleteMany();
  await prisma.privacyScore.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.device.deleteMany();
  await prisma.session.deleteMany();
  await prisma.aIAgent.deleteMany();
  await prisma.tracker.deleteMany();
  await prisma.user.deleteMany();

  // Create test users
  console.log('👤 Creating users...');
  const user1 = await prisma.user.create({
    data: {
      email: 'demo@ankrshield.com',
      name: 'Demo User',
      password: hashPassword('demo123'),
      tier: 'PREMIUM',
      privacyLevel: 8,
      emailVerified: new Date(),
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'john@example.com',
      name: 'John Doe',
      password: hashPassword('password123'),
      tier: 'FREE',
      privacyLevel: 5,
    },
  });

  console.log(`✅ Created ${2} users`);

  // Create devices
  console.log('💻 Creating devices...');
  const device1 = await prisma.device.create({
    data: {
      userId: user1.id,
      name: 'MacBook Pro',
      deviceType: 'MACOS',
      hostname: 'johns-macbook.local',
      osVersion: 'macOS 14.0',
      appVersion: '0.1.0',
      isActive: true,
    },
  });

  const device2 = await prisma.device.create({
    data: {
      userId: user1.id,
      name: 'iPhone 15',
      deviceType: 'IOS',
      osVersion: 'iOS 17.0',
      appVersion: '0.1.0',
      isActive: true,
    },
  });

  const device3 = await prisma.device.create({
    data: {
      userId: user2.id,
      name: 'Windows PC',
      deviceType: 'WINDOWS',
      osVersion: 'Windows 11',
      appVersion: '0.1.0',
      isActive: false,
      lastSeenAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    },
  });

  console.log(`✅ Created ${3} devices`);

  // Create trackers
  console.log('🕵️  Creating trackers...');
  const trackers = await Promise.all([
    prisma.tracker.create({
      data: {
        domain: 'google-analytics.com',
        category: 'ANALYTICS',
        vendor: 'Google',
        threatLevel: 'MEDIUM',
        description: 'Google Analytics tracking',
        sources: ['disconnect', 'easylist'],
        blockedCount: 1520,
      },
    }),
    prisma.tracker.create({
      data: {
        domain: 'facebook.com',
        category: 'SOCIAL_MEDIA',
        vendor: 'Meta',
        threatLevel: 'HIGH',
        description: 'Facebook tracking pixel',
        sources: ['disconnect', 'privacy-badger'],
        blockedCount: 3421,
      },
    }),
    prisma.tracker.create({
      data: {
        domain: 'doubleclick.net',
        category: 'ADVERTISING',
        vendor: 'Google',
        threatLevel: 'MEDIUM',
        description: 'Google advertising network',
        sources: ['disconnect', 'ublock'],
        blockedCount: 5234,
      },
    }),
    prisma.tracker.create({
      data: {
        domain: 'amazon-adsystem.com',
        category: 'ADVERTISING',
        vendor: 'Amazon',
        threatLevel: 'MEDIUM',
        description: 'Amazon advertising',
        sources: ['easylist'],
        blockedCount: 892,
      },
    }),
    prisma.tracker.create({
      data: {
        domain: 'malware-domain.ru',
        category: 'MALWARE',
        vendor: 'Unknown',
        threatLevel: 'CRITICAL',
        description: 'Known malware distribution site',
        sources: ['malware-domains'],
        blockedCount: 12,
      },
    }),
  ]);

  console.log(`✅ Created ${trackers.length} trackers`);

  // Create network events
  console.log('🌐 Creating network events...');
  const now = new Date();
  const events = [];

  for (let i = 0; i < 100; i++) {
    const timestamp = new Date(now.getTime() - i * 60 * 1000); // Last 100 minutes
    const tracker = trackers[Math.floor(Math.random() * trackers.length)];
    const isBlocked = Math.random() > 0.3; // 70% blocked

    events.push(
      prisma.networkEvent.create({
        data: {
          timestamp,
          deviceId: Math.random() > 0.5 ? device1.id : device2.id,
          userId: user1.id,
          eventType: isBlocked ? 'DNS_BLOCKED' : 'DNS_QUERY',
          domain: tracker.domain,
          ip: `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
          protocol: 'HTTPS',
          trackerId: tracker.id,
          isBlocked,
          blockedBy: isBlocked ? 'blocklist' : null,
          bytesIn: Math.floor(Math.random() * 10000),
          bytesOut: Math.floor(Math.random() * 5000),
        },
      })
    );
  }

  await Promise.all(events);
  console.log(`✅ Created ${events.length} network events`);

  // Create AI agents
  console.log('🤖 Creating AI agents...');
  const aiAgents = await Promise.all([
    prisma.aIAgent.create({
      data: {
        name: 'ChatGPT',
        agentType: 'CHATGPT',
        processNames: ['ChatGPT', 'openai'],
        domains: ['chat.openai.com', 'api.openai.com'],
        executablePaths: ['/Applications/ChatGPT.app'],
        vendor: 'OpenAI',
        version: '1.2023.352',
        description: 'OpenAI ChatGPT desktop application',
        isVerified: true,
        riskScore: 35,
      },
    }),
    prisma.aIAgent.create({
      data: {
        name: 'GitHub Copilot',
        agentType: 'COPILOT',
        processNames: ['Copilot', 'copilot'],
        domains: ['copilot.github.com', 'api.githubcopilot.com'],
        executablePaths: ['/usr/local/bin/copilot'],
        vendor: 'GitHub',
        version: '1.145.0',
        description: 'GitHub Copilot AI coding assistant',
        isVerified: true,
        riskScore: 25,
      },
    }),
    prisma.aIAgent.create({
      data: {
        name: 'Claude Desktop',
        agentType: 'CLAUDE',
        processNames: ['Claude', 'claude'],
        domains: ['claude.ai', 'api.anthropic.com'],
        executablePaths: ['/Applications/Claude.app'],
        vendor: 'Anthropic',
        version: '0.5.2',
        description: 'Anthropic Claude desktop application',
        isVerified: true,
        riskScore: 30,
      },
    }),
  ]);

  console.log(`✅ Created ${aiAgents.length} AI agents`);

  // Create AI activities
  console.log('📊 Creating AI activities...');
  const aiActivities = [];

  for (let i = 0; i < 50; i++) {
    const timestamp = new Date(now.getTime() - i * 120 * 1000); // Last 50 events
    const agent = aiAgents[Math.floor(Math.random() * aiAgents.length)];
    const isBlocked = Math.random() > 0.9; // 10% blocked

    aiActivities.push(
      prisma.aIActivity.create({
        data: {
          timestamp,
          agentId: agent.id,
          deviceId: device1.id,
          activityType: ['FILE_READ', 'NETWORK', 'CLIPBOARD'][Math.floor(Math.random() * 3)],
          resource: `/Users/john/Documents/private-file-${i}.txt`,
          isBlocked,
          blockedReason: isBlocked ? 'Sensitive file access blocked' : null,
        },
      })
    );
  }

  await Promise.all(aiActivities);
  console.log(`✅ Created ${aiActivities.length} AI activities`);

  // Create policies
  console.log('📜 Creating policies...');
  const policies = await Promise.all([
    prisma.policy.create({
      data: {
        userId: user1.id,
        name: 'Block All Advertising',
        description: 'Block all advertising trackers',
        isEnabled: true,
        priority: 10,
        conditions: JSON.stringify({
          categories: ['ADVERTISING'],
        }),
        action: 'BLOCK',
        notifyUser: false,
        logEvent: true,
      },
    }),
    prisma.policy.create({
      data: {
        userId: user1.id,
        name: 'Block High-Risk Trackers',
        description: 'Block all high-risk and critical trackers',
        isEnabled: true,
        priority: 20,
        conditions: JSON.stringify({
          threatLevels: ['HIGH', 'CRITICAL'],
        }),
        action: 'BLOCK',
        notifyUser: true,
        logEvent: true,
      },
    }),
    prisma.policy.create({
      data: {
        userId: user1.id,
        name: 'Notify on AI File Access',
        description: 'Get notified when AI agents access files',
        isEnabled: true,
        priority: 5,
        conditions: JSON.stringify({
          aiActivityTypes: ['FILE_READ', 'FILE_WRITE'],
        }),
        action: 'NOTIFY',
        notifyUser: true,
        logEvent: true,
      },
    }),
  ]);

  console.log(`✅ Created ${policies.length} policies`);

  // Create privacy scores
  console.log('📈 Creating privacy scores...');
  const privacyScores = [];

  for (let i = 0; i < 30; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000); // Last 30 days
    const overallScore = 70 + Math.floor(Math.random() * 20);

    privacyScores.push(
      prisma.privacyScore.create({
        data: {
          userId: user1.id,
          timestamp: date,
          overallScore,
          networkScore: overallScore + Math.floor(Math.random() * 10) - 5,
          dnsScore: overallScore + Math.floor(Math.random() * 10) - 5,
          appScore: overallScore + Math.floor(Math.random() * 10) - 5,
          aiScore: overallScore + Math.floor(Math.random() * 10) - 5,
          totalRequests: 1000 + Math.floor(Math.random() * 500),
          blockedRequests: 700 + Math.floor(Math.random() * 200),
          allowedRequests: 300 + Math.floor(Math.random() * 300),
          trackersBlocked: 50 + Math.floor(Math.random() * 50),
          previousScore: i < 29 ? overallScore - 3 : null,
          scoreChange: i < 29 ? 3 : null,
          period: 'daily',
        },
      })
    );
  }

  await Promise.all(privacyScores);
  console.log(`✅ Created ${privacyScores.length} privacy scores`);

  // Create alerts
  console.log('🚨 Creating alerts...');
  const alerts = await Promise.all([
    prisma.alert.create({
      data: {
        userId: user1.id,
        severity: 'WARNING',
        title: 'High-Risk Tracker Blocked',
        message: 'Blocked access to malware-domain.ru',
        category: 'HIGH_RISK_TRACKER',
        isRead: false,
      },
    }),
    prisma.alert.create({
      data: {
        userId: user1.id,
        severity: 'INFO',
        title: 'Privacy Score Improved',
        message: 'Your privacy score increased to 87/100',
        category: 'PRIVACY_BREACH',
        isRead: true,
      },
    }),
    prisma.alert.create({
      data: {
        userId: user1.id,
        severity: 'ERROR',
        title: 'Suspicious AI Activity',
        message: 'ChatGPT attempted to access sensitive files',
        category: 'AI_SUSPICIOUS',
        isRead: false,
      },
    }),
  ]);

  console.log(`✅ Created ${alerts.length} alerts`);

  // Create daily stats
  console.log('📊 Creating daily stats...');
  const dailyStats = [];

  for (let i = 0; i < 30; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    date.setHours(0, 0, 0, 0);

    dailyStats.push(
      prisma.dailyStats.create({
        data: {
          userId: user1.id,
          date,
          totalRequests: 800 + Math.floor(Math.random() * 400),
          blockedRequests: 600 + Math.floor(Math.random() * 200),
          dnsQueries: 500 + Math.floor(Math.random() * 200),
          dnsBlocked: 350 + Math.floor(Math.random() * 150),
          uniqueTrackers: 30 + Math.floor(Math.random() * 20),
          trackersBlocked: 25 + Math.floor(Math.random() * 15),
          topTracker: trackers[Math.floor(Math.random() * trackers.length)].domain,
          topCategory: ['ADVERTISING', 'ANALYTICS', 'SOCIAL_MEDIA'][Math.floor(Math.random() * 3)],
          activeDevices: 2,
          aiActivities: 10 + Math.floor(Math.random() * 20),
          aiBlocked: Math.floor(Math.random() * 5),
        },
      })
    );
  }

  await Promise.all(dailyStats);
  console.log(`✅ Created ${dailyStats.length} daily stats`);

  console.log('');
  console.log('🎉 Seeding completed successfully!');
  console.log('');
  console.log('📝 Test credentials:');
  console.log('   Email: demo@ankrshield.com');
  console.log('   Password: demo123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
