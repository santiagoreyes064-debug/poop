import { PrismaClient, TraderStatus, Dex } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed a handful of demo traders and verified token metadata so the leaderboard
 * and risk engine have something to work with on a fresh database.
 */
async function main() {
  const tokens = [
    {
      mintAddress: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      name: 'Wrapped SOL',
      decimals: 9,
      verified: true,
    },
    {
      mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      verified: true,
    },
    {
      mintAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      verified: true,
    },
    {
      mintAddress: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      symbol: 'JUP',
      name: 'Jupiter',
      decimals: 6,
      verified: true,
    },
  ];

  for (const token of tokens) {
    await prisma.tokenMetadata.upsert({
      where: { mintAddress: token.mintAddress },
      update: token,
      create: token,
    });
  }

  const demoTraders = [
    {
      walletAddress: '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
      label: 'Solana Whale',
      roi7d: 42.5,
      roi30d: 138.2,
      winRate: 0.68,
      sharpeRatio: 2.4,
      maxDrawdown: 0.18,
      avgHoldTime: 5400,
      totalTrades: 312,
    },
    {
      walletAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      label: 'Momentum Bot',
      roi7d: 18.1,
      roi30d: 61.7,
      winRate: 0.59,
      sharpeRatio: 1.6,
      maxDrawdown: 0.27,
      avgHoldTime: 1800,
      totalTrades: 1204,
    },
    {
      walletAddress: '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStpr2yz1tXe5',
      label: 'Steady Hands',
      roi7d: 7.4,
      roi30d: 29.9,
      winRate: 0.74,
      sharpeRatio: 3.1,
      maxDrawdown: 0.09,
      avgHoldTime: 86400,
      totalTrades: 88,
    },
  ];

  for (const t of demoTraders) {
    await prisma.trader.upsert({
      where: { walletAddress: t.walletAddress },
      update: { ...t, status: TraderStatus.ACTIVE, lastTradeAt: new Date() },
      create: { ...t, status: TraderStatus.ACTIVE, lastTradeAt: new Date() },
    });
  }

  // Keep a reference to Dex so the import is meaningful for downstream extension.
  void Dex.JUPITER;

  console.log(`Seeded ${tokens.length} tokens and ${demoTraders.length} traders.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
