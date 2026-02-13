# Contributing to Zustand API Manager

Thank you for your interest in contributing! We appreciate your help in making this library better.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher

### Setup Development Environment

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/zustand-api-manager.git
   cd zustand-api-manager
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 🏗️ Development Workflow

### Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

### Linting and Formatting

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Check formatting
npm run format:check

# Format code
npm run format
```

### Building

```bash
# Build both CJS and ESM bundles
npm run build

# Build only CJS
npm run build:cjs

# Build only ESM
npm run build:esm

# Type checking
npm run typecheck
```

## 📝 Coding Guidelines

### TypeScript

- Use TypeScript for all new code
- Provide proper type definitions
- Avoid using `any` type
- Use generics appropriately

### Code Style

- Follow the existing code style
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

### Testing

- Write tests for all new features
- Maintain or improve code coverage
- Test edge cases and error conditions
- Use descriptive test names

Example:
```typescript
describe('featureName', () => {
  it('should handle specific case correctly', () => {
    // Arrange
    const input = setupTestData()

    // Act
    const result = functionUnderTest(input)

    // Assert
    expect(result).toBe(expected)
  })
})
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `test:` adding or updating tests
- `refactor:` code refactoring
- `perf:` performance improvements
- `chore:` tooling, dependencies, etc.

Examples:
```bash
feat: add useApiMutation hook for mutations
fix: race condition in concurrent requests
docs: update API reference for new lifecycle hooks
test: add tests for prefetch functionality
```

## 🐛 Bug Reports

When filing a bug report, please include:

1. **Description**: Clear description of the issue
2. **Reproduction**: Minimal code to reproduce the problem
3. **Expected behavior**: What you expected to happen
4. **Actual behavior**: What actually happened
5. **Environment**:
   - Node.js version
   - React version
   - Zustand version
   - Browser (if applicable)

## 💡 Feature Requests

We welcome feature requests! Please:

1. Check if the feature already exists
2. Search existing issues to avoid duplicates
3. Describe the problem you're trying to solve
4. Propose a solution or API design
5. Consider backwards compatibility

## 🔄 Pull Request Process

1. **Before submitting**:
   - Update documentation if needed
   - Add tests for new features
   - Ensure all tests pass
   - Run linter and fix any issues
   - Update CHANGELOG.md

2. **PR Guidelines**:
   - Keep PRs focused on a single feature/fix
   - Reference related issues
   - Provide clear description of changes
   - Include screenshots/examples if applicable

3. **Review Process**:
   - Maintainers will review your PR
   - Address feedback and requested changes
   - Once approved, your PR will be merged

## 📚 Documentation

When adding features:

- Update README.md if it affects the public API
- Add JSDoc comments to new functions/types
- Create examples in the `examples/` directory
- Update relevant documentation in `docs/`

## 🧪 Testing Philosophy

- **Unit tests**: Test individual functions/components
- **Integration tests**: Test how parts work together
- **Edge cases**: Test boundary conditions
- **Error handling**: Test error scenarios

## 🎯 Areas for Contribution

Looking for where to start? Check out:

- Issues labeled `good first issue`
- Issues labeled `help wanted`
- Documentation improvements
- Test coverage improvements
- Example applications
- Performance optimizations

## 📞 Getting Help

- Open an issue for bugs or features
- Start a discussion for questions
- Check existing documentation
- Review examples directory

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Thank You!

Your contributions make this project better for everyone. We appreciate your time and effort!
