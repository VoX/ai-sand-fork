.PHONY: test test-headed test-ui report setup install clean

# Run all tests
test:
	./run-tests.sh

# Run tests with browser visible
test-headed:
	./run-tests.sh --headed

# Run tests in Playwright UI mode
test-ui:
	./run-tests.sh --ui

# Show the HTML report
report:
	npx playwright show-report

# Install dependencies and browsers
setup: install
	npx playwright install chromium

install:
	bun install

# Clean test artifacts
clean:
	rm -rf playwright-report test-results
