param(
  [string]$ServerInstance = ".\SQLEXPRESS",
  [string]$Database = "Hostel",
  [string]$OutDir = (Join-Path (Get-Location) "manual-backups\import-source\sql-export")
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Data

function New-SqlConnection {
  $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
  $builder["Data Source"] = $ServerInstance
  $builder["Initial Catalog"] = $Database
  $builder["Integrated Security"] = $true
  $builder["Encrypt"] = $false
  $builder["TrustServerCertificate"] = $true
  $builder["Application Name"] = "CRM legacy export"
  return New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
}

function Invoke-SqlTable {
  param([string]$Sql)

  $connection = New-SqlConnection
  $command = $connection.CreateCommand()
  $command.CommandText = $Sql
  $command.CommandTimeout = 0
  $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($command)
  $table = New-Object System.Data.DataTable
  try {
    [void]$adapter.Fill($table)
    return ,$table
  } finally {
    $adapter.Dispose()
    $command.Dispose()
    $connection.Dispose()
  }
}

function Quote-SqlName {
  param([string]$Name)
  return "[" + $Name.Replace("]", "]]") + "]"
}

function Convert-FieldToCsv {
  param($Value)

  if ($null -eq $Value -or $Value -is [System.DBNull]) {
    return "NULL"
  }

  if ($Value -is [byte[]]) {
    $text = [Convert]::ToBase64String($Value)
  } elseif ($Value -is [datetime]) {
    $text = $Value.ToString("yyyy-MM-dd HH:mm:ss.fff", [System.Globalization.CultureInfo]::InvariantCulture)
  } elseif ($Value -is [decimal] -or $Value -is [double] -or $Value -is [single]) {
    $text = $Value.ToString([System.Globalization.CultureInfo]::InvariantCulture)
  } else {
    $text = [string]$Value
  }

  if ($text.Contains('"') -or $text.Contains(';') -or $text.Contains("`r") -or $text.Contains("`n")) {
    return '"' + $text.Replace('"', '""') + '"'
  }
  return $text
}

function Write-DataTableCsv {
  param(
    [System.Data.DataTable]$Table,
    [string]$Path
  )

  $utf8WithBom = New-Object System.Text.UTF8Encoding($true)
  $writer = New-Object System.IO.StreamWriter($Path, $false, $utf8WithBom)
  try {
    $headers = @()
    foreach ($column in $Table.Columns) {
      $headers += (Convert-FieldToCsv $column.ColumnName)
    }
    $writer.WriteLine(($headers -join ";"))

    foreach ($row in $Table.Rows) {
      $fields = @()
      foreach ($column in $Table.Columns) {
        $fields += (Convert-FieldToCsv $row[$column])
      }
      $writer.WriteLine(($fields -join ";"))
    }
  } finally {
    $writer.Dispose()
  }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$tablesSql = @"
SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME
"@

$columnsSql = @"
SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  COLUMN_NAME,
  ORDINAL_POSITION,
  DATA_TYPE,
  CHARACTER_MAXIMUM_LENGTH,
  NUMERIC_PRECISION,
  NUMERIC_SCALE,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
"@

$tables = Invoke-SqlTable $tablesSql
$columns = Invoke-SqlTable $columnsSql
$summary = New-Object System.Collections.Generic.List[object]

foreach ($tableRow in $tables.Rows) {
  $schema = [string]$tableRow["TABLE_SCHEMA"]
  $tableName = [string]$tableRow["TABLE_NAME"]
  $qualifiedName = (Quote-SqlName $schema) + "." + (Quote-SqlName $tableName)
  $fileName = ($schema + "." + $tableName + ".csv") -replace '[\\/:*?"<>|]', "_"
  $csvPath = Join-Path $OutDir $fileName

  Write-Host "Exporting $qualifiedName -> $fileName"
  $data = Invoke-SqlTable "SELECT * FROM $qualifiedName"
  Write-DataTableCsv -Table $data -Path $csvPath

  $summary.Add([pscustomobject]@{
    schema = $schema
    table = $tableName
    file = $fileName
    rows = $data.Rows.Count
  })
}

$schemaObject = [pscustomobject]@{
  exportedAt = (Get-Date).ToString("o")
  server = $ServerInstance
  database = $Database
  delimiter = ";"
  nullLiteral = "NULL"
  tables = $summary
  columns = @($columns.Rows | ForEach-Object {
    [pscustomobject]@{
      schema = [string]$_["TABLE_SCHEMA"]
      table = [string]$_["TABLE_NAME"]
      column = [string]$_["COLUMN_NAME"]
      ordinal = [int]$_["ORDINAL_POSITION"]
      dataType = [string]$_["DATA_TYPE"]
      maxLength = if ($_["CHARACTER_MAXIMUM_LENGTH"] -is [System.DBNull]) { $null } else { [int]$_["CHARACTER_MAXIMUM_LENGTH"] }
      numericPrecision = if ($_["NUMERIC_PRECISION"] -is [System.DBNull]) { $null } else { [int]$_["NUMERIC_PRECISION"] }
      numericScale = if ($_["NUMERIC_SCALE"] -is [System.DBNull]) { $null } else { [int]$_["NUMERIC_SCALE"] }
      nullable = ([string]$_["IS_NULLABLE"] -eq "YES")
    }
  })
}

$schemaObject | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutDir "schema.json") -Encoding UTF8
$summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutDir "export-summary.json") -Encoding UTF8

Write-Host "Done. Exported $($summary.Count) tables to $OutDir"
