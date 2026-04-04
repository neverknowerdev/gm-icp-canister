// Complexity Manager
// Handles complexity calculation, epoch management, and difficulty adjustment
// Moved from smart contract to ICP canister

export interface EpochConfig {
    epochNumber: bigint;
    epochStartedAt: number; // timestamp
    lastEpochPoints: bigint;
    currentEpochPoints: bigint;
    pointsDeltaStreak: bigint; // signed integer represented as bigint
    coinsMultiplicator: bigint;
    epochDays: number; // EPOCH_DAYS constant
}

// Global epoch state
let epochConfig: EpochConfig = {
    epochNumber: 0n,
    epochStartedAt: 0,
    lastEpochPoints: 0n,
    currentEpochPoints: 0n,
    pointsDeltaStreak: 0n,
    coinsMultiplicator: 1_000_000n, // Default multiplicator
    epochDays: 2, // Default epoch length in days
};

/**
 * Initialize epoch configuration
 */
export function initializeEpochConfig(
    epochNumber: bigint,
    epochStartedAt: number,
    lastEpochPoints: bigint,
    currentEpochPoints: bigint,
    pointsDeltaStreak: bigint,
    coinsMultiplicator: bigint,
    epochDays: number
): void {
    epochConfig = {
        epochNumber,
        epochStartedAt,
        lastEpochPoints,
        currentEpochPoints,
        pointsDeltaStreak,
        coinsMultiplicator,
        epochDays,
    };
    console.log(`Epoch config initialized: epoch=${epochNumber}, multiplicator=${coinsMultiplicator}`);
}

/**
 * Get current epoch configuration
 */
export function getEpochConfig(): EpochConfig {
    return { ...epochConfig };
}

/**
 * Check if a new epoch should start
 * @param mintingDayTimestamp The day timestamp to check against
 * @returns true if a new epoch should start
 */
export function shouldStartNewEpoch(mintingDayTimestamp: number): boolean {
    if (epochConfig.epochStartedAt === 0) {
        // First epoch, always start
        return true;
    }

    const epochDuration = epochConfig.epochDays * 24 * 60 * 60; // Convert days to seconds
    return mintingDayTimestamp > epochConfig.epochStartedAt && 
           (mintingDayTimestamp - epochConfig.epochStartedAt) >= epochDuration;
}

/**
 * Start a new epoch
 * Adjusts complexity based on previous epoch performance
 * @param mintingDayTimestamp The day timestamp for the new epoch
 * @returns The new coins multiplicator
 */
export function startNewEpoch(mintingDayTimestamp: number): bigint {
    if (shouldStartNewEpoch(mintingDayTimestamp)) {
        // Adjust points streak
        epochConfig.pointsDeltaStreak = adjustPointsStreak(
            epochConfig.lastEpochPoints,
            epochConfig.currentEpochPoints,
            epochConfig.pointsDeltaStreak
        );

        // Change complexity
        const newMultiplicator = changeComplexity(
            epochConfig.coinsMultiplicator,
            epochConfig.lastEpochPoints,
            epochConfig.currentEpochPoints,
            epochConfig.pointsDeltaStreak
        );

        console.log(`Starting new epoch: epoch=${epochConfig.epochNumber + 1n}, multiplicator=${newMultiplicator} (was ${epochConfig.coinsMultiplicator})`);
        console.log(`Previous epoch points: ${epochConfig.lastEpochPoints}, Current: ${epochConfig.currentEpochPoints}, Streak: ${epochConfig.pointsDeltaStreak}`);

        // Update epoch state
        epochConfig.epochNumber += 1n;
        epochConfig.epochStartedAt = mintingDayTimestamp;
        epochConfig.lastEpochPoints = epochConfig.currentEpochPoints;
        epochConfig.currentEpochPoints = 0n;
        epochConfig.coinsMultiplicator = newMultiplicator;

        return newMultiplicator;
    }

    return epochConfig.coinsMultiplicator;
}

/**
 * Add points to current epoch
 */
export function addEpochPoints(points: bigint): void {
    epochConfig.currentEpochPoints += points;
}

/**
 * Calculate complexity based on epoch performance
 * Matches the smart contract logic from TwitterOracle.sol
 */
function changeComplexity(
    currentComplexity: bigint,
    lastEpochPoints: bigint,
    currentEpochPoints: bigint,
    epochPointsDeltaStreak: bigint
): bigint {
    if (lastEpochPoints === 0n) {
        return currentComplexity;
    }

    if (currentEpochPoints > lastEpochPoints) {
        // minus 30%
        return (currentComplexity * 70n) / 100n;
    }

    if (currentEpochPoints <= lastEpochPoints) {
        // Convert streak to signed integer for comparison
        const streak = Number(epochPointsDeltaStreak);
        if (streak <= -3) {
            // plus 30%
            return (currentComplexity * 130n) / 100n;
        } else if (streak === -2) {
            // plus 20%
            return (currentComplexity * 120n) / 100n;
        } else {
            return currentComplexity;
        }
    }

    return currentComplexity;
}

/**
 * Adjust points streak based on epoch performance
 * Matches the smart contract logic from TwitterOracle.sol
 */
function adjustPointsStreak(
    lastEpochPoints: bigint,
    currentEpochPoints: bigint,
    currentPointsDeltaStreak: bigint
): bigint {
    const streak = Number(currentPointsDeltaStreak);
    
    if (currentEpochPoints > lastEpochPoints && streak <= 0) {
        return 1n;
    }
    if (currentEpochPoints < lastEpochPoints && streak >= 0) {
        return -1n;
    }

    if (currentEpochPoints > lastEpochPoints) {
        return currentPointsDeltaStreak + 1n;
    } else if (currentEpochPoints < lastEpochPoints) {
        return currentPointsDeltaStreak - 1n;
    }

    return currentPointsDeltaStreak;
}

/**
 * Get current coins multiplicator
 */
export function getCoinsMultiplicator(): bigint {
    return epochConfig.coinsMultiplicator;
}

