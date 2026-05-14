# Java / Kotlin — Test Quality Tooling

## Coverage analysis — JaCoCo

JaCoCo is the standard coverage tool for the JVM. It instruments bytecode at
load time and reports line, branch, method, class, and cyclomatic complexity.

### Maven

```xml
<!-- pom.xml -->
<plugin>
  <groupId>org.jacoco</groupId>
  <artifactId>jacoco-maven-plugin</artifactId>
  <version>0.8.12</version>
  <executions>
    <execution>
      <goals><goal>prepare-agent</goal></goals>
    </execution>
    <execution>
      <id>report</id>
      <phase>test</phase>
      <goals><goal>report</goal></goals>
    </execution>
  </executions>
</plugin>
```

```bash
mvn test
open target/site/jacoco/index.html
```

### Gradle (Kotlin DSL)

```kotlin
// build.gradle.kts
plugins {
    jacoco
}

tasks.test {
    finalizedBy(tasks.jacocoTestReport)
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        html.required.set(true)
        xml.required.set(true)   // for CI / SonarQube
    }
}

// Optional: fail build below thresholds
tasks.jacocoTestCoverageVerification {
    violationRules {
        rule {
            limit { minimum = "0.80".toBigDecimal() }    // line
        }
        rule {
            limit {
                counter = "BRANCH"
                minimum = "0.70".toBigDecimal()          // branch
            }
        }
    }
}
```

```bash
./gradlew test jacocoTestReport jacocoTestCoverageVerification
open build/reports/jacoco/test/html/index.html
```

### Reading the JaCoCo HTML report

The report shows per-class and per-method coverage with colour coding:
- 🟢 Green — fully covered
- 🟡 Yellow — partially covered (one branch taken, other not)
- 🔴 Red — not covered

Yellow is the important signal: it marks every branch point (`if`, `switch`,
`? :`, `&&`, `||`) where only the `true` or only the `false` path was exercised.
A method with 100% line coverage but 50% branch coverage has untested paths.

---

## Mutation testing — PIT (Pitest)

PIT is the standard mutation testing framework for the JVM.

### Maven

```xml
<plugin>
  <groupId>org.pitest</groupId>
  <artifactId>pitest-maven</artifactId>
  <version>1.15.3</version>
  <configuration>
    <targetClasses>
      <param>com.example.*</param>
    </targetClasses>
    <targetTests>
      <param>com.example.*Test</param>
    </targetTests>
    <mutators>STRONGER</mutators>   <!-- DEFAULT | STRONGER | ALL -->
    <outputFormats>HTML,XML</outputFormats>
    <timestampedReports>false</timestampedReports>
  </configuration>
</plugin>
```

```bash
mvn org.pitest:pitest-maven:mutationCoverage
open target/pit-reports/index.html
```

### Gradle

```bash
./gradlew pitest
open build/reports/pitest/index.html
```

### Mutator sets

| Set | What it applies |
|-----|----------------|
| `DEFAULT` | Arithmetic, negation, conditionals, returns, void methods |
| `STRONGER` | DEFAULT + increments, invert negatives, empty returns |
| `ALL` | Everything, including experimental — noisy, use on critical modules only |

Start with `STRONGER`. Use `ALL` only for security-critical or financial logic.

### Reading the PIT report

Each method shows:
- **Line coverage** — JaCoCo-style
- **Mutation coverage** — % of mutants killed
- Survived mutants listed with their exact diff

```
SURVIVED: com.example.Pricing::calculateTotal line 42
  Replaced integer addition with subtraction
```

A method at 100% line / 40% mutation coverage has tests that walk through
the method without asserting on its arithmetic or conditional logic.

### Incremental analysis (large projects)

```xml
<configuration>
  <withHistory>true</withHistory>
  <historyOutputLocation>pit-history.xml</historyOutputLocation>
  <historyInputLocation>pit-history.xml</historyInputLocation>
</configuration>
```

With history enabled, PIT only re-runs mutants affected by changed code,
making re-runs fast enough for CI.

---

## Combining JaCoCo + PIT

```bash
# Step 1: generate JaCoCo report
mvn test

# Step 2: run PIT (it uses JaCoCo coverage data internally to skip uncovered mutants)
mvn org.pitest:pitest-maven:mutationCoverage

# Survived mutants in yellow (partially covered) JaCoCo branches:
# those are the weakest tests in the codebase
```
