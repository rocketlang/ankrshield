# Contributing to ankrshield

Thank you for your interest in contributing to ankrshield! 🛡️

## Getting Started

### Prerequisites

- Node.js 20+ LTS
- pnpm 8+
- PostgreSQL 15+ (with TimescaleDB & pgvector extensions)
- Redis 7+
- Git

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/rocketlang/ankrshield.git
cd ankrshield

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your local configuration

# Setup database
docker-compose up -d postgres redis

# Run database migrations
pnpm db:migrate

# Seed database
pnpm db:seed

# Start development servers
pnpm dev
```

## Development Workflow

### Branching Strategy

- `main` - Production-ready code
- `develop` - Development branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates
- `refactor/*` - Code refactoring

### Making Changes

1. Create a new branch from `develop`:

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our coding standards

3. Write/update tests for your changes

4. Run tests and linting:

   ```bash
   pnpm test
   pnpm lint
   pnpm typecheck
   ```

5. Commit your changes using conventional commits:

   ```bash
   git commit -m "feat(api): add user authentication endpoint"
   ```

6. Push to your branch:

   ```bash
   git push origin feature/your-feature-name
   ```

7. Create a Pull Request to `develop`

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(dns-resolver): add DNS-over-HTTPS support
fix(api): resolve authentication token expiration issue
docs(readme): update installation instructions
refactor(privacy-engine): simplify scoring algorithm
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Avoid `any` - use proper types
- Document complex types

### Code Style

- Use Prettier for formatting (automatic via pre-commit hooks)
- Follow ESLint rules
- Keep functions small and focused
- Write self-documenting code

### Testing

- Write tests for all new features
- Maintain >80% code coverage
- Use descriptive test names:
  ```typescript
  describe('DNSResolver', () => {
    it('should block known tracker domains', async () => {
      // test implementation
    });
  });
  ```

### Documentation

- Update documentation for any user-facing changes
- Add JSDoc comments for public APIs
- Keep README.md updated

## Code Review Process

1. All changes require a Pull Request
2. At least one approval required
3. All CI checks must pass
4. No merge conflicts
5. Branch must be up-to-date with base branch

## Reporting Bugs

Create an issue with:

- Clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)
- Screenshots if applicable

## Security Vulnerabilities

**DO NOT** create public issues for security vulnerabilities.

Email: security@ankrshield.com

## Feature Requests

We welcome feature requests! Create an issue with:

- Clear description of the feature
- Use case / motivation
- Proposed implementation (optional)

## Questions?

- 💬 Discord: [Join our community](https://discord.gg/ankrshield)
- 📧 Email: developers@ankrshield.com
- 💻 GitHub Discussions: Use for questions and discussions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (TBD).

---

Thank you for contributing to ankrshield! Together we're building a more private future. 🛡️
