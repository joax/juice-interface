// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "./../interfaces/IFundingCycles.sol";

library FundingCycleMetadataResolver {
    function reservedRate(FundingCycle memory _fundingCycle)
        internal
        pure
        returns (uint256)
    {
        return uint256(uint8(_fundingCycle.metadata >> 8));
    }

    function redemptionRate(FundingCycle memory _fundingCycle)
        internal
        pure
        returns (uint256)
    {
        return uint256(uint8(_fundingCycle.metadata >> 16));
    }

    function ballotRedemptionRate(FundingCycle memory _fundingCycle)
        internal
        pure
        returns (uint256)
    {
        return uint256(uint8(_fundingCycle.metadata >> 24));
    }

    function payPaused(FundingCycle memory _fundingCycle)
        internal
        pure
        returns (bool)
    {
        return ((_fundingCycle.metadata >> 32) & 1) == 0;
    }

    function tapPaused(FundingCycle memory _fundingCycle)
        internal
        pure
        returns (bool)
    {
        return ((_fundingCycle.metadata >> 33) & 1) == 0;
    }

    function redeemPaused(FundingCycle memory _fundingCycle)
        internal
        pure
        returns (bool)
    {
        return ((_fundingCycle.metadata >> 34) & 1) == 0;
    }

    function useDataSourceForPay(FundingCycle memory _fundingCycle)
        internal
        pure
        returns (bool)
    {
        return (_fundingCycle.metadata >> 35) & 1 == 0;
    }

    function useDataSourceForRedeem(FundingCycle memory _fundingCycle)
        internal
        pure
        returns (bool)
    {
        return (_fundingCycle.metadata >> 36) & 1 == 0;
    }

    function dataSource(FundingCycle memory _fundingCycle)
        internal
        pure
        returns (address)
    {
        return address(uint160(_fundingCycle.metadata >> 37));
    }
}
