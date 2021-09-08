// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "./interfaces/ITokenStore.sol";
import "./abstract/Operatable.sol";
import "./abstract/BootloadableTerminalUtility.sol";

import "./libraries/Operations.sol";

import "./Token.sol";

/** 
  @notice 
  Manage Token minting, burning, and account balances.

  @dev
  Tokens can be either represented internally staked, or as unstaked ERC-20s.
  This contract manages these two representations and the conversion between the two.

  @dev
  The total supply of a project's tokens and the balance of each account are calculated in this contract.
*/
contract TokenStore is BootloadableTerminalUtility, Operatable, ITokenStore {
    // --- public immutable stored properties --- //

    /// @notice The Projects contract which mints ERC-721's that represent project ownership and transfers.
    IProjects public immutable override projects;

    // --- public stored properties --- //

    // Each project's ERC20 Token tokens.
    mapping(uint256 => IToken) public override tokenOf;

    // Each holder's balance of staked Tokens for each project.
    mapping(address => mapping(uint256 => uint256))
        public
        override stakedBalanceOf;

    // The total supply of staked tokens for each project.
    mapping(uint256 => uint256) public override stakedTotalSupplyOf;

    // The amount of each holders tokens that are locked.
    mapping(address => mapping(uint256 => uint256))
        public
        override lockedBalanceOf;

    // The amount of each holders tokens that are locked by each address.
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        public
        override lockedBalanceBy;

    // --- external views --- //

    /** 
      @notice 
      The total supply of tokens for each project, including staked and unstaked tokens.

      @param _projectId The ID of the project to get the total supply of.

      @return supply The total supply.
    */
    function totalSupplyOf(uint256 _projectId)
        external
        view
        override
        returns (uint256 supply)
    {
        supply = stakedTotalSupplyOf[_projectId];
        IToken _token = tokenOf[_projectId];
        if (_token != IToken(address(0)))
            supply = supply + _token.totalSupply();
    }

    /** 
      @notice 
      The total balance of tokens a holder has for a specified project, including staked and unstaked tokens.

      @param _holder The token holder to get a balance for.
      @param _projectId The project to get the `_hodler`s balance of.

      @return balance The balance.
    */
    function balanceOf(address _holder, uint256 _projectId)
        external
        view
        override
        returns (uint256 balance)
    {
        balance = stakedBalanceOf[_holder][_projectId];
        IToken _token = tokenOf[_projectId];
        if (_token != IToken(address(0)))
            balance = balance + _token.balanceOf(_holder);
    }

    // --- external transactions --- //

    /** 
      @param _projects A Projects contract which mints ERC-721's that represent project ownership and transfers.
      @param _operatorStore A contract storing operator assignments.
      @param _terminalDirectory A directory of a project's current Juicebox terminal to receive payments in.
    */
    constructor(
        IProjects _projects,
        IOperatorStore _operatorStore,
        ITerminalDirectory _terminalDirectory,
        address _bootloader
    )
        Operatable(_operatorStore)
        BootloadableTerminalUtility(_terminalDirectory, _bootloader)
    {
        projects = _projects;
    }

    /**
        @notice 
        Issues an owner's ERC-20 Tokens that'll be used when unstaking tokens.

        @dev 
        Deploys an owner's Token ERC-20 token contract.

        @param _projectId The ID of the project being issued tokens.
        @param _name The ERC-20's name.
        @param _symbol The ERC-20's symbol.
    */
    function issue(
        uint256 _projectId,
        string calldata _name,
        string calldata _symbol
    )
        external
        override
        requirePermission(
            projects.ownerOf(_projectId),
            _projectId,
            Operations.Issue
        )
    {
        // There must be a name.
        require((bytes(_name).length > 0), "TokenStore::issue: EMPTY_NAME");

        // There must be a symbol.
        require((bytes(_symbol).length > 0), "TokenStore::issue: EMPTY_SYMBOL");

        // Only one ERC20 token can be issued.
        require(
            tokenOf[_projectId] == IToken(address(0)),
            "TokenStore::issue: ALREADY_ISSUED"
        );

        // Create the contract in this TerminalV1 contract in order to have mint and burn privileges.
        // Prepend the strings with standards.
        tokenOf[_projectId] = new Token(_name, _symbol);

        emit Issue(_projectId, _name, _symbol, msg.sender);
    }

    /** 
      @notice 
      Mint new tokens.

      @dev
      Only a project's current terminal can mint its tokens.

      @param _holder The address receiving the new tokens.
      @param _projectId The project to which the tokens belong.
      @param _amount The amount to mint.
      @param _preferUnstakedTokens Whether ERC20's should be converted automatically if they have been issued.
    */
    function mint(
        address _holder,
        uint256 _projectId,
        uint256 _amount,
        bool _preferUnstakedTokens
    ) external override onlyTerminalOrBootloader(_projectId) {
        // An amount must be specified.
        require(_amount > 0, "TokenStore::mint: NO_OP");

        // Get a reference to the project's ERC20 tokens.
        IToken _token = tokenOf[_projectId];

        // If there exists ERC-20 tokens and the caller prefers these unstaked tokens.
        bool _shouldUnstakeTokens = _preferUnstakedTokens &&
            _token != IToken(address(0));

        if (_shouldUnstakeTokens) {
            // Mint the equivalent amount of ERC20s.
            _token.mint(_holder, _amount);
        } else {
            // Add to the staked balance and total supply.
            stakedBalanceOf[_holder][_projectId] =
                stakedBalanceOf[_holder][_projectId] +
                _amount;
            stakedTotalSupplyOf[_projectId] =
                stakedTotalSupplyOf[_projectId] +
                _amount;
        }

        emit Mint(
            _holder,
            _projectId,
            _amount,
            _shouldUnstakeTokens,
            _preferUnstakedTokens,
            msg.sender
        );
    }

    /** 
      @notice 
      Burns tokens.

      @dev
      Only a project's current terminal can burn its tokens.

      @param _holder The address that owns the tokens being burned.
      @param _projectId The ID of the project of the tokens being burned.
      @param _amount The amount of tokens being burned.
      @param _preferUnstaked If the preference is to burn tokens that have been converted to ERC-20s.
    */
    function burn(
        address _holder,
        uint256 _projectId,
        uint256 _amount,
        bool _preferUnstaked
    ) external override onlyTerminal(_projectId) {
        // Get a reference to the project's ERC20 tokens.
        IToken _token = tokenOf[_projectId];

        // Get a reference to the staked amount.
        uint256 _unlockedStakedBalance = stakedBalanceOf[_holder][_projectId] -
            lockedBalanceOf[_holder][_projectId];

        // Get a reference to the number of tokens there are.
        uint256 _unstakedBalanceOf = _token == IToken(address(0))
            ? 0
            : _token.balanceOf(_holder);

        // There must be enough tokens.
        // Prevent potential overflow by not relying on addition.
        require(
            (_amount < _unstakedBalanceOf &&
                _amount < _unlockedStakedBalance) ||
                (_amount >= _unstakedBalanceOf &&
                    _unlockedStakedBalance >= _amount - _unstakedBalanceOf) ||
                (_amount >= _unlockedStakedBalance &&
                    _unstakedBalanceOf >= _amount - _unlockedStakedBalance),
            "TokenStore::redeem: INSUFFICIENT_FUNDS"
        );

        // The amount of tokens to burn.
        uint256 _unstakedTokensToBurn;

        // If there's no balance, redeem no tokens.
        if (_unstakedBalanceOf == 0) {
            _unstakedTokensToBurn = 0;
            // If prefer converted, redeem tokens before redeeming staked tokens.
        } else if (_preferUnstaked) {
            _unstakedTokensToBurn = _unstakedBalanceOf >= _amount
                ? _amount
                : _unstakedBalanceOf;
            // Otherwise, redeem staked tokens before unstaked tokens.
        } else {
            _unstakedTokensToBurn = _unlockedStakedBalance >= _amount
                ? 0
                : _amount - _unlockedStakedBalance;
        }

        // The amount of staked tokens to redeem.
        uint256 _stakedTokensToBurn = _amount - _unstakedTokensToBurn;

        // burn the tokens.
        if (_unstakedTokensToBurn > 0)
            _token.burn(_holder, _unstakedTokensToBurn);
        if (_stakedTokensToBurn > 0) {
            // Reduce the holders balance and the total supply.
            stakedBalanceOf[_holder][_projectId] =
                stakedBalanceOf[_holder][_projectId] -
                _stakedTokensToBurn;
            stakedTotalSupplyOf[_projectId] =
                stakedTotalSupplyOf[_projectId] -
                _stakedTokensToBurn;
        }

        emit Burn(
            _holder,
            _projectId,
            _amount,
            _unlockedStakedBalance,
            _preferUnstaked,
            msg.sender
        );
    }

    /**
      @notice 
      Stakes ERC20 tokens by burning their supply and creating an internal staked version.

      @dev
      Only a ticket holder or an operator can stake its tokens.

      @param _holder The owner of the tokens to stake.
      @param _projectId The ID of the project whos tokens are being staked.
      @param _amount The amount of tokens to stake.
     */
    function stake(
        address _holder,
        uint256 _projectId,
        uint256 _amount
    )
        external
        override
        requirePermissionAllowingWildcardDomain(
            _holder,
            _projectId,
            Operations.Stake
        )
    {
        // Get a reference to the project's ERC20 tokens.
        IToken _token = tokenOf[_projectId];

        // Tokens must have been issued.
        require(_token != IToken(address(0)), "TokenStore::stake: NOT_FOUND");

        // Get a reference to the holder's current balance.
        uint256 _unstakedBalanceOf = _token.balanceOf(_holder);

        // There must be enough balance to stake.
        require(
            _unstakedBalanceOf >= _amount,
            "TokenStore::stake: INSUFFICIENT_FUNDS"
        );

        // Burn the equivalent amount of ERC20s.
        _token.burn(_holder, _amount);

        // Add the staked amount from the holder's balance.
        stakedBalanceOf[_holder][_projectId] =
            stakedBalanceOf[_holder][_projectId] +
            _amount;

        // Add the staked amount from the project's total supply.
        stakedTotalSupplyOf[_projectId] =
            stakedTotalSupplyOf[_projectId] +
            _amount;

        emit Stake(_holder, _projectId, _amount, msg.sender);
    }

    /**
      @notice 
      Unstakes internal tokens by creating and distributing ERC20 tokens.

      @dev
      Only a token holder or an operator can unstake its tokens.

      @param _holder The owner of the tokens to unstake.
      @param _projectId The ID of the project whos tokens are being unstaked.
      @param _amount The amount of tokens to unstake.
     */
    function unstake(
        address _holder,
        uint256 _projectId,
        uint256 _amount
    )
        external
        override
        requirePermissionAllowingWildcardDomain(
            _holder,
            _projectId,
            Operations.Unstake
        )
    {
        // Get a reference to the project's ERC20 tokens.
        IToken _token = tokenOf[_projectId];

        // Tokens must have been issued.
        require(_token != IToken(address(0)), "TokenStore::unstake: NOT_FOUND");

        // Get a reference to the amount of unstaked tokens.
        uint256 _unlockedStakedTokens = stakedBalanceOf[_holder][_projectId] -
            lockedBalanceOf[_holder][_projectId];

        // There must be enough unlocked staked tokens to unstake.
        require(
            _unlockedStakedTokens >= _amount,
            "TokenStore::unstake: INSUFFICIENT_FUNDS"
        );

        // Subtract the unstaked amount from the holder's balance.
        stakedBalanceOf[_holder][_projectId] =
            stakedBalanceOf[_holder][_projectId] -
            _amount;

        // Subtract the unstaked amount from the project's total supply.
        stakedTotalSupplyOf[_projectId] =
            stakedTotalSupplyOf[_projectId] -
            _amount;

        // Mint the equivalent amount of ERC20s.
        _token.mint(_holder, _amount);

        emit Unstake(_holder, _projectId, _amount, msg.sender);
    }

    /** 
      @notice 
      Lock a project's tokens, preventing them from being redeemed and from converting to ERC20s.

      @dev
      Only a ticket holder or an operator can lock its tokens.

      @param _holder The holder to lock tokens from.
      @param _projectId The ID of the project whos tokens are being locked.
      @param _amount The amount of tokens to lock.
    */
    function lock(
        address _holder,
        uint256 _projectId,
        uint256 _amount
    )
        external
        override
        requirePermissionAllowingWildcardDomain(
            _holder,
            _projectId,
            Operations.Lock
        )
    {
        // Amount must be greater than 0.
        require(_amount > 0, "TokenStore::lock: NO_OP");

        // The holder must have enough tokens to lock.
        require(
            stakedBalanceOf[_holder][_projectId] -
                lockedBalanceOf[_holder][_projectId] >=
                _amount,
            "TokenStore::lock: INSUFFICIENT_FUNDS"
        );

        // Update the lock.
        lockedBalanceOf[_holder][_projectId] =
            lockedBalanceOf[_holder][_projectId] +
            _amount;
        lockedBalanceBy[msg.sender][_holder][_projectId] =
            lockedBalanceBy[msg.sender][_holder][_projectId] +
            _amount;

        emit Lock(_holder, _projectId, _amount, msg.sender);
    }

    /** 
      @notice 
      Unlock a project's tokens.

      @dev
      The address that locked the tokens must be the address that unlocks the tokens.

      @param _holder The holder to unlock tokens from.
      @param _projectId The ID of the project whos tokens are being unlocked.
      @param _amount The amount of tokens to unlock.
    */
    function unlock(
        address _holder,
        uint256 _projectId,
        uint256 _amount
    ) external override {
        // Amount must be greater than 0.
        require(_amount > 0, "TokenStore::unlock: NO_OP");

        // There must be enough locked tokens to unlock.
        require(
            lockedBalanceBy[msg.sender][_holder][_projectId] >= _amount,
            "TokenStore::unlock: INSUFFICIENT_FUNDS"
        );

        // Update the lock.
        lockedBalanceOf[_holder][_projectId] =
            lockedBalanceOf[_holder][_projectId] -
            _amount;
        lockedBalanceBy[msg.sender][_holder][_projectId] =
            lockedBalanceBy[msg.sender][_holder][_projectId] -
            _amount;

        emit Unlock(_holder, _projectId, _amount, msg.sender);
    }

    /** 
      @notice 
      Allows a ticket holder to transfer its tokens to another account, without unstaking to ERC-20s.

      @dev
      Only a ticket holder or an operator can transfer its tokens.

      @param _holder The holder to transfer tokens from.
      @param _projectId The ID of the project whos tokens are being transfered.
      @param _amount The amount of tokens to transfer.
      @param _recipient The recipient of the tokens.
    */
    function transfer(
        address _holder,
        uint256 _projectId,
        uint256 _amount,
        address _recipient
    )
        external
        override
        requirePermissionAllowingWildcardDomain(
            _holder,
            _projectId,
            Operations.Transfer
        )
    {
        // Can't transfer to the zero address.
        require(_recipient != address(0), "TokenStore::transfer: ZERO_ADDRESS");

        // An address can't transfer to itself.
        require(_holder != _recipient, "TokenStore::transfer: IDENTITY");

        // There must be an amount to transfer.
        require(_amount > 0, "TokenStore::transfer: NO_OP");

        // Get a reference to the amount of unlocked staked tokens.
        uint256 _unlockedStakedTokens = stakedBalanceOf[_holder][_projectId] -
            lockedBalanceOf[_holder][_projectId];

        // There must be enough unlocked staked tokens to transfer.
        require(
            _amount <= _unlockedStakedTokens,
            "TokenStore::transfer: INSUFFICIENT_FUNDS"
        );

        // Subtract from the holder.
        stakedBalanceOf[_holder][_projectId] =
            stakedBalanceOf[_holder][_projectId] -
            _amount;

        // Add the tokens to the recipient.
        stakedBalanceOf[_recipient][_projectId] =
            stakedBalanceOf[_recipient][_projectId] +
            _amount;

        emit Transfer(_holder, _projectId, _recipient, _amount, msg.sender);
    }
}
